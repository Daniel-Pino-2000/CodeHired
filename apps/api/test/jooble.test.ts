import assert from 'node:assert/strict'
import { before, beforeEach, describe, test } from 'node:test'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import { periodKey } from '../src/ingest/budget.js'
import { createHttpClient } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { getSource, splitConfiguredSources } from '../src/ingest/sources/index.js'
import {
  JOOBLE_BUDGET,
  JOOBLE_DAILY_PLAN_LIMIT,
  JOOBLE_PAGES_PER_QUERY,
  JOOBLE_QUERIES,
  JOOBLE_RESULTS_PER_PAGE,
  createJoobleSource,
  joobleUrl,
  normalizeJoobleJob,
  parseJoobleSalary,
  type JoobleJob
} from '../src/ingest/sources/jooble.js'

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }
// A test value only: the real key is a repository secret
const KEY = 'test-jooble-key'
const KEYS = { JOOBLE_API_KEY: KEY }

// Shaped like a job of the documented POST /api/{key} response. The ids are 64-bit numbers that
// JSON.parse rounds, which is why the adapter reads them from the link.
const joobleJob = (overrides: Partial<JoobleJob> = {}): JoobleJob => ({
  id: -1234567890123456800,
  title: 'Senior <b>Software Engineer</b>',
  location: 'Denver, CO',
  snippet: '&nbsp;...build <b>software</b> for our logistics platform in TypeScript and Go. Hybrid role, three days a week in the office...&nbsp;',
  salary: '$140k - $175k',
  source: 'acme-logistics.com',
  type: 'Full-time',
  link: 'https://jooble.org/desc/-1234567890123456789?ckey=software+engineer&rgn=-1&pos=1&p=1',
  company: 'Acme Logistics',
  updated: '2026-11-18T00:00:00.0000000',
  ...overrides
})

interface Search {
  keywords: string
  location: string
  page: string
  ResultOnPage: string
}

// Answers every search with the jobs listed for its keywords and page, or with an error status
function fakeFetch (byQuery: Record<string, JoobleJob[][]> = {}, status = 200) {
  const requests: Array<{ url: string, method?: string, search: Search }> = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const search = JSON.parse(String(init?.body)) as Search
    requests.push({ url: String(url), method: init?.method, search })
    if (status !== 200) return new Response('Too many requests', { status })
    const jobs = byQuery[search.keywords]?.[Number(search.page) - 1] ?? []
    return new Response(JSON.stringify({ totalCount: jobs.length, jobs }), { headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch: fetch as typeof globalThis.fetch, requests }
}

const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, retries: 0, sleep: async () => {} })

const unlimited = { take: async () => true, remaining: async () => Infinity }

async function collect (source: ReturnType<typeof createJoobleSource>, logger: Logger = silent) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger })) jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  return jobs
}

before(async () => { await runMigrations() })

beforeEach(async () => {
  await db.execute('DELETE FROM api_usage')
})

describe('Jooble budget', () => {
  test('a run fits in the daily budget, which stays well below the free plan', () => {
    assert.ok(JOOBLE_QUERIES.length * JOOBLE_PAGES_PER_QUERY <= JOOBLE_BUDGET.day!)
    assert.ok(JOOBLE_BUDGET.day! < JOOBLE_DAILY_PLAN_LIMIT)
    assert.ok(JOOBLE_BUDGET.month! <= JOOBLE_BUDGET.day! * 31)
  })

  test('stops when the day is used up, counting every call before it is made', async () => {
    const day = periodKey('day', new Date('2026-11-25T06:17:00Z'))
    await db.execute({ sql: "INSERT INTO api_usage (source, period, calls) VALUES ('jooble', ?, 17)", args: [day] })
    const { fetch, requests } = fakeFetch()
    const warnings: string[] = []
    const source = createJoobleSource({ http: testHttp(fetch), env: KEYS, now: () => new Date('2026-11-25T06:17:00Z') })

    await collect(source, { ...silent, warn: (message: string) => { warnings.push(message) } })

    assert.equal(requests.length, 3)
    assert.match(warnings.join('\n'), /call budget reached, skipping "full stack developer"/)
    const { rows } = await db.execute({ sql: "SELECT calls FROM api_usage WHERE source = 'jooble' AND period = ?", args: [day] })
    assert.equal(Number(rows[0].calls), 20)
  })
})

describe('Jooble source', () => {
  test('is skipped until JOOBLE_API_KEY is set, and runs once a day', () => {
    const jooble = getSource('jooble')!
    assert.deepEqual(splitConfiguredSources([jooble], {}).unconfigured.map(({ missing }) => missing), [['JOOBLE_API_KEY']])
    assert.equal(splitConfiguredSources([jooble], KEYS).ready.length, 1)
    assert.equal(jooble.minHoursBetweenRuns, 20)
    assert.ok(jooble.snippetOnly && jooble.seesOnlyRecentJobs)
  })

  test('posts one search per query and page, with the key in the path only', async () => {
    const fullPage = Array.from({ length: JOOBLE_RESULTS_PER_PAGE }, (_, index) =>
      joobleJob({ link: `https://jooble.org/desc/${1000 + index}?pos=${index}` }))
    const { fetch, requests } = fakeFetch({ 'software engineer': [fullPage, [joobleJob()]] })

    const jobs = await collect(createJoobleSource({ http: testHttp(fetch), env: KEYS, budget: unlimited }))

    // A full first page asks for the second; a short page ends the query
    assert.equal(requests.length, 2 + (JOOBLE_QUERIES.length - 1))
    assert.ok(requests.every((request) => request.method === 'POST' && request.url === joobleUrl(KEY)))
    assert.deepEqual(requests[0].search, { keywords: 'software engineer', location: '', page: '1', ResultOnPage: '50' })
    assert.equal(requests[1].search.page, '2')
    assert.equal(jobs.length, JOOBLE_RESULTS_PER_PAGE + 1)
  })

  test('maps a job: the id from the link, plain text, the yearly salary and the UTC date', () => {
    const job = normalizedJobSchema.parse(normalizeJoobleJob(joobleJob()))

    assert.equal(job.sourceId, '-1234567890123456789')
    assert.equal(job.sourceUrl, 'https://jooble.org/desc/-1234567890123456789?ckey=software+engineer&rgn=-1&pos=1&p=1')
    assert.equal(job.publisher, null)
    assert.equal(job.title, 'Senior Software Engineer')
    assert.equal(job.company, 'Acme Logistics')
    assert.deepEqual([job.location, job.city, job.state, job.country], ['Denver, CO', 'Denver', 'CO', 'US'])
    assert.equal(job.workplace, 'hybrid', 'the snippet says the role is hybrid')
    assert.equal(job.level, 'senior')
    assert.deepEqual([job.salaryMin, job.salaryMax, job.currency], [140000, 175000, 'USD'])
    assert.equal(job.postedAt, '2026-11-18T00:00:00Z')
    assert.doesNotMatch(job.description, /<b>|&nbsp;/)
  })

  test('keeps remote and country-wide jobs, drops non-tech roles and duplicates across queries', async () => {
    const remote = joobleJob({ link: 'https://jooble.org/desc/2', title: 'Backend Developer', location: 'Remote' })
    const anywhere = joobleJob({ link: 'https://jooble.org/desc/3', title: 'Data Engineer', location: 'United States' })
    const sales = joobleJob({ link: 'https://jooble.org/desc/4', title: 'Account Executive' })
    const abroad = joobleJob({ link: 'https://jooble.org/desc/5', location: 'Toronto, ON' })
    const { fetch } = fakeFetch({
      'software engineer': [[joobleJob(), remote, sales, abroad]],
      'backend developer': [[remote, anywhere]]
    })

    const jobs = await collect(createJoobleSource({ http: testHttp(fetch), env: KEYS, budget: unlimited }))

    assert.deepEqual(jobs.map((job) => [job.sourceId, job.location]), [
      ['-1234567890123456789', 'Denver, CO'],
      ['2', 'Remote (US)'],
      ['3', 'United States']
    ])
  })

  test('reads only yearly dollar salaries', () => {
    const range = (text: string) => { const { salaryMin, salaryMax } = parseJoobleSalary(text); return [salaryMin, salaryMax] }
    assert.deepEqual(range('$95,000 - $120,000 a year'), [95000, 120000])
    assert.deepEqual(range('$130k'), [130000, 130000])
    assert.deepEqual(range('$45 - $60 per hour'), [null, null])
    assert.deepEqual(range('$8,000 a month'), [null, null])
    assert.deepEqual(range('€60,000'), [null, null])
    assert.deepEqual(range(''), [null, null])
  })

  test('a failed request fails the run without the key in the message', async () => {
    const { fetch } = fakeFetch({}, 429)

    const summary = await ingestSource(createJoobleSource({ http: testHttp(fetch), env: KEYS, budget: unlimited }), { logger: silent })

    assert.equal(summary.status, 'failed')
    assert.match(summary.error ?? '', /POST https:\/\/jooble\.org\/api\/\*\*\* responded 429/)
    assert.doesNotMatch(summary.error ?? '', new RegExp(KEY))
  })
})
