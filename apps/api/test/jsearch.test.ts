import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import request from 'supertest'
import { db } from '../src/db/database.js'
import { createCallBudget, periodKey } from '../src/ingest/budget.js'
import { createHttpClient } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { missingEnv, splitConfiguredSources } from '../src/ingest/sources/index.js'
import {
  JSEARCH_BUDGET,
  JSEARCH_MONTHLY_PLAN_LIMIT,
  JSEARCH_QUERIES,
  JSEARCH_QUERIES_PER_RUN,
  createJSearchSource,
  jsearchQueriesFor,
  jsearchUrl,
  normalizeJSearchJob,
  type JSearchJob
} from '../src/ingest/sources/jsearch.js'
import type { Job } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }
// A test value only: the real key is a repository secret
const KEYS = { JSEARCH_API_KEY: 'test-jsearch-key' }

// Shaped like a real job of GET /jsearch/search-v2
const jsearchJob = (overrides: Partial<JSearchJob> = {}): JSearchJob => ({
  job_id: 'woj2gE2S_6LqvmLAAAAAAA==',
  job_title: 'Senior Software Engineer',
  employer_name: 'Lakeshore Robotics',
  job_publisher: 'LinkedIn',
  job_apply_link: 'https://www.linkedin.com/jobs/view/4012345678',
  job_employment_types: ['FULLTIME'],
  job_employment_type: 'Full-time',
  job_description: 'Lakeshore Robotics is hiring a senior software engineer to build our TypeScript and Go fleet platform. You will own services end to end.',
  job_is_remote: false,
  job_posted_at_datetime_utc: '2026-11-18T14:00:00.000Z',
  job_posted_at_timestamp: 1795010400,
  job_location: 'Chicago, IL',
  job_city: 'Chicago',
  job_state: 'Illinois',
  job_country: 'US',
  job_min_salary: 150000,
  job_max_salary: 190000,
  job_salary_period: 'YEAR',
  ...overrides
})

// Answers every query with the jobs listed for it (by role), or with an error status
function fakeFetch (byQuery: Record<string, JSearchJob[]> = {}, status = 200) {
  const requests: Array<{ url: string, headers: Record<string, string> }> = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } })
    if (status !== 200) return new Response('Too many requests', { status })
    const query = new URL(String(url)).searchParams.get('query') ?? ''
    const role = query.replace(/ jobs in the United States$/, '')
    return new Response(JSON.stringify({
      status: 'OK',
      request_id: 'test',
      parameters: { query },
      data: { jobs: byQuery[role] ?? [], cursor: null }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch: fetch as typeof globalThis.fetch, requests }
}

const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, retries: 0, sleep: async () => {} })

const unlimited = { take: async () => true, remaining: async () => Infinity }

async function collect (source: ReturnType<typeof createJSearchSource>, logger: Logger = silent) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger })) jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  return jobs
}

beforeEach(async () => {
  await db.execute('DELETE FROM api_usage')
})

describe('JSearch budget', () => {
  test('stays below the free plan: at most 190 a month, 6 a day fits a 31-day month', () => {
    assert.equal(JSEARCH_BUDGET.month, 190)
    assert.ok(JSEARCH_BUDGET.month! < JSEARCH_MONTHLY_PLAN_LIMIT)
    assert.ok(JSEARCH_BUDGET.day! * 31 <= JSEARCH_BUDGET.month!)
    assert.ok(JSEARCH_QUERIES_PER_RUN <= JSEARCH_BUDGET.day!)
  })

  test('a whole month of runs, several a day, never sends more than 190 requests', async () => {
    const { fetch, requests } = fakeFetch()
    for (let day = 1; day <= 31; day++) {
      // Four scheduled runs and a couple by hand: only the first 6 calls of the day go out
      for (let run = 0; run < 6; run++) {
        const now = () => new Date(Date.UTC(2026, 11, day, run * 4, 17))
        const source = createJSearchSource({ http: testHttp(fetch), env: KEYS, now })
        await collect(source)
      }
    }
    assert.equal(requests.length, 6 * 31)
    assert.ok(requests.length <= 190)
    const { rows } = await db.execute("SELECT calls FROM api_usage WHERE source = 'jsearch' AND period = '2026-12'")
    assert.equal(Number(rows[0].calls), 186)
  })

  test('stops at 190 in the month even when the day still has calls left', async () => {
    // Earlier runs this month (a burst by hand, for example) already used 188 requests
    await db.execute({ sql: "INSERT INTO api_usage (source, period, calls) VALUES ('jsearch', ?, 188)", args: [periodKey('month', new Date('2026-11-25T00:00:00Z'))] })
    const { fetch, requests } = fakeFetch({ 'software engineer': [jsearchJob()] })
    const warnings: string[] = []
    const now = () => new Date('2026-11-25T06:17:00Z')
    const source = createJSearchSource({ http: testHttp(fetch), env: KEYS, now })
    await collect(source, { ...silent, warn: (message: string) => warnings.push(message) })

    assert.equal(requests.length, 2)
    assert.match(warnings.join('\n'), /budget reached/)
    const { rows } = await db.execute("SELECT calls FROM api_usage WHERE source = 'jsearch' AND period = '2026-11'")
    assert.equal(Number(rows[0].calls), 190)
    assert.equal(await createCallBudget('jsearch', JSEARCH_BUDGET, { now }).take(), false)
  })
})

describe('JSearch source', () => {
  test('asks for one page of today\'s US jobs per query', () => {
    const url = new URL(jsearchUrl('data engineer'))
    assert.equal(url.origin + url.pathname, 'https://api.openwebninja.com/jsearch/search-v2')
    assert.equal(url.searchParams.get('query'), 'data engineer jobs in the United States')
    assert.equal(url.searchParams.get('num_pages'), '1')
    assert.equal(url.searchParams.get('country'), 'us')
    assert.equal(url.searchParams.get('date_posted'), 'today')
  })

  test('rotates the queries day by day, covering all of them', () => {
    const day = new Date('2026-11-19T06:00:00Z')
    const today = jsearchQueriesFor(day)
    assert.equal(today.length, JSEARCH_QUERIES_PER_RUN)
    assert.equal(new Set(today).size, JSEARCH_QUERIES_PER_RUN)
    assert.deepEqual(jsearchQueriesFor(new Date('2026-11-19T23:59:00Z')), today, 'the same all day')
    const tomorrow = jsearchQueriesFor(new Date('2026-11-20T06:00:00Z'))
    assert.notDeepEqual(tomorrow, today)
    assert.deepEqual(new Set([...today, ...tomorrow]), new Set(JSEARCH_QUERIES))
  })

  test('maps a job: original publisher, apply link, place, yearly salary and dates', () => {
    const job = normalizedJobSchema.parse(normalizeJSearchJob(jsearchJob({ job_offer_expiration_datetime_utc: '2026-12-18T00:00:00.000Z' })))
    assert.equal(job.publisher, 'LinkedIn')
    assert.equal(job.sourceUrl, 'https://www.linkedin.com/jobs/view/4012345678')
    assert.equal(job.sourceId, 'woj2gE2S_6LqvmLAAAAAAA==')
    assert.equal(job.title, 'Senior Software Engineer')
    assert.equal(job.company, 'Lakeshore Robotics')
    assert.equal(job.location, 'Chicago, IL')
    assert.equal(job.city, 'Chicago')
    assert.equal(job.state, 'IL')
    assert.equal(job.country, 'US')
    assert.equal(job.remote, false)
    assert.equal(job.workplace, 'onsite')
    assert.equal(job.level, 'senior')
    assert.equal(job.employmentType, 'full-time')
    assert.equal(job.salaryMin, 150000)
    assert.equal(job.salaryMax, 190000)
    assert.equal(job.postedAt, '2026-11-18T14:00:00Z')
    assert.equal(job.closesAt, '2026-12-18T00:00:00Z')
    assert.equal(job.descriptionHtml, null)
    assert.match(job.description, /TypeScript and Go fleet platform/)
  })

  test('reads remote jobs, contracts, internships and hourly pay', () => {
    const remote = normalizeJSearchJob(jsearchJob({ job_is_remote: true, job_city: null, job_state: null, job_location: 'United States' }))
    assert.equal(remote.location, 'Remote (US)')
    assert.equal(remote.workplace, 'remote')
    const contract = normalizeJSearchJob(jsearchJob({ job_employment_types: ['CONTRACTOR'], job_salary_period: 'HOUR', job_min_salary: 70, job_max_salary: 90 }))
    assert.equal(contract.employmentType, 'contract')
    assert.equal(contract.salaryMin, null)
    assert.equal(contract.salaryMax, null)
    assert.equal(normalizeJSearchJob(jsearchJob({ job_employment_types: ['INTERN'], job_title: 'Software Engineering Intern' })).employmentType, 'internship')
    assert.equal(normalizeJSearchJob(jsearchJob({ job_state: 'TX', job_city: 'Austin' })).location, 'Austin, TX')
    const noDate = normalizeJSearchJob(jsearchJob({ job_posted_at_datetime_utc: null, job_offer_expiration_timestamp: 1798761600 }))
    assert.equal(noDate.postedAt, '2026-11-18T14:00:00.000Z')
    assert.equal(noDate.closesAt, '2027-01-01T00:00:00.000Z')
  })

  test('falls back to the highlights when there is no description', () => {
    const job = normalizedJobSchema.parse(normalizeJSearchJob(jsearchJob({
      job_description: null,
      job_highlights: { Qualifications: ['5+ years building web services', 'Strong Python'], Benefits: [] }
    })))
    assert.equal(job.description, 'Qualifications\n- 5+ years building web services\n- Strong Python')
  })

  test('keeps US tech roles only, once each across queries, and sends the key in a header', async () => {
    const shared = jsearchJob({ job_id: 'shared' })
    const { fetch, requests } = fakeFetch({
      'software engineer': [shared, jsearchJob({ job_id: 'toronto', job_country: 'CA', job_city: 'Toronto', job_state: 'ON' })],
      'backend developer': [shared, jsearchJob({ job_id: 'backend', job_title: 'Backend Developer' })],
      'frontend developer': [jsearchJob({ job_id: 'sales', job_title: 'Account Executive' })]
    })
    const now = () => new Date('2026-11-19T06:17:00Z')
    const source = createJSearchSource({ http: testHttp(fetch), env: KEYS, budget: unlimited, now })
    const jobs = await collect(source)

    assert.deepEqual(jobs.map((job) => job.sourceId).sort(), ['backend', 'shared'])
    assert.equal(requests.length, JSEARCH_QUERIES_PER_RUN)
    for (const sent of requests) {
      // Never LinkedIn, Indeed or ZipRecruiter themselves
      assert.equal(new URL(sent.url).host, 'api.openwebninja.com')
      assert.equal(sent.headers['x-api-key'], 'test-jsearch-key')
      assert.doesNotMatch(sent.url, /test-jsearch-key/)
    }
  })

  test('fails the run on an error response, without the key in the message', async () => {
    const { fetch, requests } = fakeFetch({}, 429)
    const source = createJSearchSource({ http: testHttp(fetch), env: KEYS, budget: unlimited })
    await assert.rejects(collect(source), (error: Error) => {
      assert.match(error.message, /429/)
      assert.doesNotMatch(error.message, /test-jsearch-key/)
      return true
    })
    assert.equal(requests.length, 1)
  })

  test('the default client never retries, so every request sent was counted', async () => {
    const { fetch, requests } = fakeFetch({}, 503)
    // The default client reads `globalThis.fetch` when it is built: hand it the stub for that moment
    const offline = globalThis.fetch
    globalThis.fetch = fetch
    let source: ReturnType<typeof createJSearchSource>
    try {
      source = createJSearchSource({ env: KEYS })
    } finally {
      globalThis.fetch = offline
    }
    await assert.rejects(collect(source), /503/)
    assert.equal(requests.length, 1)
    const { rows } = await db.execute("SELECT SUM(calls) AS calls FROM api_usage WHERE source = 'jsearch' AND period LIKE '____-__'")
    assert.equal(Number(rows[0].calls), 1)
  })

  test('is skipped while its key is unset', () => {
    const source = createJSearchSource()
    assert.deepEqual(missingEnv(source, {}), ['JSEARCH_API_KEY'])
    assert.deepEqual(missingEnv(source, KEYS), [])
    const { ready } = splitConfiguredSources([source], { JSEARCH_API_KEY: ' ' })
    assert.equal(ready.length, 0)
  })
})

describe('JSearch jobs in the API', () => {
  test('say which site published them and link to the original posting', async () => {
    const { fetch } = fakeFetch({
      'software engineer': [jsearchJob({ job_id: 'via-indeed', job_title: 'Platform Engineer', employer_name: 'Prairie Freight', job_publisher: 'Indeed', job_apply_link: 'https://www.indeed.com/viewjob?jk=abc123', job_offer_expiration_datetime_utc: '2099-01-01T00:00:00.000Z' })]
    })
    const now = () => new Date('2026-11-19T06:17:00Z')
    const source = createJSearchSource({ http: testHttp(fetch), env: KEYS, budget: unlimited, now })
    const summary = await ingestSource(source, { logger: silent, now: now() })
    assert.equal(summary.status, 'succeeded')
    assert.equal(summary.inserted, 1)

    const response = await request(app).get('/jobs').query({ source: 'jsearch' })
    const job = (response.body.data as Job[]).find((candidate) => candidate.title === 'Platform Engineer')
    assert.ok(job)
    assert.deepEqual(job.source, {
      id: 'jsearch',
      name: 'JSearch',
      publisher: 'Indeed',
      url: 'https://www.indeed.com/viewjob?jk=abc123',
      credit: null
    })
    assert.equal(job.descriptionIsSnippet, true)
    assert.equal(job.closesAt, '2099-01-01T00:00:00Z')
  })
})
