import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import request from 'supertest'
import { db } from '../src/db/database.js'
import { createCallBudget, periodKey } from '../src/ingest/budget.js'
import { createHttpClient } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import {
  ADZUNA_BUDGET,
  ADZUNA_RESULTS_PER_PAGE,
  adzunaUrl,
  createAdzunaSource,
  normalizeAdzunaJob,
  redactAdzunaKey,
  type AdzunaJob
} from '../src/ingest/sources/adzuna.js'
import { missingEnv, splitConfiguredSources } from '../src/ingest/sources/index.js'
import type { Job } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }
const KEYS = { ADZUNA_APP_ID: 'test-id', ADZUNA_APP_KEY: 'secret-key' }
const CREDENTIALS = { appId: KEYS.ADZUNA_APP_ID, appKey: KEYS.ADZUNA_APP_KEY }

// Shaped like a real result of GET /v1/api/jobs/us/search/1
const adzunaJob = (overrides: Partial<AdzunaJob> = {}): AdzunaJob => ({
  id: '5012345678',
  title: 'Senior <strong>Software</strong> Engineer',
  description: 'We are hiring a senior software engineer to build our React and Node.js platform &amp; APIs…',
  created: '2026-11-18T14:03:11Z',
  redirect_url: 'https://www.adzuna.com/land/ad/5012345678?se=abc&v=def',
  company: { display_name: 'Acme Analytics' },
  location: { display_name: 'Austin, Travis County', area: ['US', 'Texas', 'Travis County', 'Austin'] },
  salary_min: 140000,
  salary_max: 175000,
  salary_is_predicted: '0',
  contract_time: 'full_time',
  contract_type: 'permanent',
  category: { tag: 'it-jobs' },
  ...overrides
})

function fakeFetch (pages: Record<number, AdzunaJob[]>, status = 200) {
  const urls: string[] = []
  const fetch = async (url: string | URL | Request) => {
    urls.push(String(url))
    const page = Number(/\/search\/(\d+)\?/.exec(String(url))?.[1])
    if (status !== 200) return new Response('Unauthorized', { status })
    return new Response(JSON.stringify({ count: 999, results: pages[page] ?? [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return { fetch: fetch as typeof globalThis.fetch, urls }
}

const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, retries: 0, sleep: async () => {} })

const fullPage = (page: number) => Array.from({ length: ADZUNA_RESULTS_PER_PAGE }, (_, index) =>
  adzunaJob({ id: `${page}-${index}`, title: `Backend Engineer ${index}` }))

const unlimited = { take: async () => true, remaining: async () => Infinity }

async function collect (source: ReturnType<typeof createAdzunaSource>, logger: Logger = silent) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger })) jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  return jobs
}

beforeEach(async () => {
  await db.execute('DELETE FROM api_usage')
})

describe('periodKey', () => {
  test('names UTC days, ISO weeks and months', () => {
    const date = new Date('2026-11-19T23:30:00Z')
    assert.equal(periodKey('day', date), '2026-11-19')
    assert.equal(periodKey('week', date), '2026-W47')
    assert.equal(periodKey('month', date), '2026-11')
    // 1 January 2027 is a Friday: it belongs to the last ISO week of 2026
    assert.equal(periodKey('week', new Date('2027-01-01T00:00:00Z')), '2026-W53')
    assert.equal(periodKey('week', new Date('2026-12-28T00:00:00Z')), '2026-W53')
    assert.equal(periodKey('week', new Date('2027-01-04T00:00:00Z')), '2027-W01')
  })
})

describe('createCallBudget', () => {
  test('stops at the daily limit and starts again the next day', async () => {
    let now = new Date('2026-11-19T10:00:00Z')
    const budget = createCallBudget('budget-day', { day: 3, month: 100 }, { now: () => now })
    for (let call = 0; call < 3; call++) assert.equal(await budget.take(), true)
    assert.equal(await budget.take(), false)
    assert.equal(await budget.remaining(), 0)

    now = new Date('2026-11-20T00:00:01Z')
    assert.equal(await budget.take(), true)
    assert.equal(await budget.remaining(), 2)
  })

  test('stops at the monthly limit whatever the day', async () => {
    let now = new Date('2026-11-01T10:00:00Z')
    const budget = createCallBudget('budget-month', { day: 2, month: 3 }, { now: () => now })
    assert.equal(await budget.take(), true)
    assert.equal(await budget.take(), true)
    assert.equal(await budget.take(), false)
    now = new Date('2026-11-02T10:00:00Z')
    assert.equal(await budget.take(), true)
    assert.equal(await budget.take(), false, 'the month is used up even though the day is not')
    now = new Date('2026-12-01T10:00:00Z')
    assert.equal(await budget.take(), true)
  })

  test('a refused call is not counted, and counts survive a new budget object (a new run)', async () => {
    const now = () => new Date('2026-11-19T10:00:00Z')
    const first = createCallBudget('budget-persist', { day: 2 }, { now })
    await first.take()
    await first.take()
    await first.take()
    const { rows } = await db.execute("SELECT calls FROM api_usage WHERE source = 'budget-persist'")
    assert.equal(Number(rows[0].calls), 2)
    assert.equal(await createCallBudget('budget-persist', { day: 2 }, { now }).take(), false)
  })

  test('keeps every Adzuna period below its documented limit', () => {
    assert.ok(ADZUNA_BUDGET.day! < 250)
    assert.ok(ADZUNA_BUDGET.week! < 1000)
    assert.ok(ADZUNA_BUDGET.month! < 2500)
    assert.ok(ADZUNA_BUDGET.day! * 7 <= ADZUNA_BUDGET.week!)
  })
})

describe('Adzuna source', () => {
  test('asks for US IT jobs of the last 2 days, newest first', () => {
    const url = new URL(adzunaUrl(3, CREDENTIALS))
    assert.equal(url.origin + url.pathname, 'https://api.adzuna.com/v1/api/jobs/us/search/3')
    assert.equal(url.searchParams.get('category'), 'it-jobs')
    assert.equal(url.searchParams.get('results_per_page'), '50')
    assert.equal(url.searchParams.get('max_days_old'), '2')
    assert.equal(url.searchParams.get('sort_by'), 'date')
  })

  test('maps a job: plain title, US place, snippet, employer salary, redirect URL', () => {
    const job = normalizedJobSchema.parse(normalizeAdzunaJob(adzunaJob()))
    assert.equal(job.title, 'Senior Software Engineer')
    assert.equal(job.company, 'Acme Analytics')
    assert.equal(job.location, 'Austin, TX')
    assert.equal(job.city, 'Austin')
    assert.equal(job.state, 'TX')
    assert.equal(job.country, 'US')
    assert.equal(job.remote, false)
    assert.equal(job.level, 'senior')
    assert.equal(job.salaryMin, 140000)
    assert.equal(job.salaryMax, 175000)
    assert.equal(job.sourceUrl, 'https://www.adzuna.com/land/ad/5012345678?se=abc&v=def')
    assert.equal(job.descriptionHtml, null)
    assert.match(job.description, /React and Node\.js platform & APIs/)
    assert.equal(job.postedAt, '2026-11-18T14:03:11Z')
  })

  test('drops salaries that are Adzuna estimates', () => {
    const job = normalizeAdzunaJob(adzunaJob({ salary_is_predicted: '1' }))
    assert.equal(job.salaryMin, null)
    assert.equal(job.salaryMax, null)
  })

  test('reads remote roles, contracts and state-only locations', () => {
    const remote = normalizeAdzunaJob(adzunaJob({ title: 'Remote Data Engineer', location: { area: ['US', 'Colorado'] } }))
    assert.equal(remote.location, 'Remote (Colorado)')
    assert.equal(remote.workplace, 'remote')
    const contract = normalizeAdzunaJob(adzunaJob({ contract_type: 'contract', location: { area: ['US'] } }))
    assert.equal(contract.employmentType, 'contract')
    assert.equal(contract.location, 'United States')
    assert.equal(normalizeAdzunaJob(adzunaJob({ contract_time: 'part_time' })).employmentType, 'part-time')
  })

  test('fetches pages until one comes back short, keeping only tech roles', async () => {
    const { fetch, urls } = fakeFetch({
      1: fullPage(1),
      2: [adzunaJob({ id: 'a' }), adzunaJob({ id: 'b', title: 'IT Help Desk Technician' })]
    })
    const source = createAdzunaSource({ http: testHttp(fetch), env: KEYS, budget: unlimited, sleep: async () => {} })
    const jobs = await collect(source)
    assert.equal(urls.length, 2)
    assert.equal(jobs.length, ADZUNA_RESULTS_PER_PAGE + 1)
  })

  test('stops when the call budget runs out, without failing the run', async () => {
    const { fetch, urls } = fakeFetch({ 1: fullPage(1), 2: fullPage(2), 3: fullPage(3) })
    const warnings: string[] = []
    const budget = createCallBudget('adzuna', { day: 2 })
    const source = createAdzunaSource({ http: testHttp(fetch), env: KEYS, budget, sleep: async () => {} })
    const jobs = await collect(source, { ...silent, warn: (message: string) => warnings.push(message) })
    assert.equal(urls.length, 2)
    assert.equal(jobs.length, 2 * ADZUNA_RESULTS_PER_PAGE)
    assert.match(warnings.join('\n'), /budget reached/)
  })

  test('waits between calls to stay below 25 a minute', async () => {
    const { fetch } = fakeFetch({ 1: fullPage(1), 2: fullPage(2), 3: [] })
    const waits: number[] = []
    const source = createAdzunaSource({ http: testHttp(fetch), env: KEYS, budget: unlimited, sleep: async (ms) => { waits.push(ms) } })
    await collect(source)
    assert.deepEqual(waits, [3000, 3000])
  })

  test('never puts the key in an error message', async () => {
    const { fetch } = fakeFetch({}, 401)
    const source = createAdzunaSource({ http: testHttp(fetch), env: KEYS, budget: unlimited })
    await assert.rejects(collect(source), (error: Error) => {
      assert.doesNotMatch(error.message, /secret-key|test-id/)
      assert.match(error.message, /401/)
      return true
    })
    assert.equal(redactAdzunaKey('GET https://x/?app_id=abc&app_key=xyz&a=1'), 'GET https://x/?app_id=***&app_key=***&a=1')
  })

  test('is skipped while its keys are unset', () => {
    const source = createAdzunaSource()
    assert.deepEqual(missingEnv(source, {}), ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'])
    assert.deepEqual(missingEnv(source, KEYS), [])
    const { ready, unconfigured } = splitConfiguredSources([source], { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: ' ' })
    assert.equal(ready.length, 0)
    assert.deepEqual(unconfigured[0].missing, ['ADZUNA_APP_KEY'])
  })
})

describe('Adzuna jobs in the API', () => {
  test('are kept open when a later run does not see them, and carry the Adzuna credit', async () => {
    const first = fakeFetch({ 1: [adzunaJob({ id: 'kept-open' })] })
    const later = fakeFetch({ 1: [adzunaJob({ id: 'newer-job', title: 'Frontend Developer' })] })
    const options = { logger: silent, now: new Date('2026-11-19T10:00:00Z') }
    const run = (fetch: typeof globalThis.fetch) =>
      ingestSource(createAdzunaSource({ http: testHttp(fetch), env: KEYS, budget: unlimited }), options)

    await run(first.fetch)
    for (let index = 0; index < 4; index++) {
      const summary = await run(later.fetch)
      assert.equal(summary.status, 'succeeded')
      assert.equal(summary.closed, 0)
    }

    const response = await request(app).get('/jobs').query({ text: 'Senior Software Engineer', source: 'adzuna' })
    const job = (response.body.data as Job[]).find((candidate) => candidate.title === 'Senior Software Engineer')
    assert.ok(job, 'the job a later run missed is still listed')
    assert.deepEqual(job.source, {
      id: 'adzuna',
      name: 'Adzuna',
      publisher: null,
      url: 'https://www.adzuna.com/land/ad/5012345678?se=abc&v=def',
      credit: { text: 'Jobs by Adzuna', url: 'https://www.adzuna.com' }
    })
    assert.equal(job.descriptionIsSnippet, true)
  })
})
