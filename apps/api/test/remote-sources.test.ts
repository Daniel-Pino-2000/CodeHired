import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import request from 'supertest'
import { parseRemoteLocation } from '../src/ingest/filters.js'
import { createHttpClient } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { FIXTURES_DIR } from '../src/ingest/sources/fixture.js'
import { createHimalayasSource, himalayasSearchUrl, type HimalayasJob } from '../src/ingest/sources/himalayas.js'
import { createJobicySource, jobicyUrl } from '../src/ingest/sources/jobicy.js'
import { createRemoteOkSource, REMOTEOK_URL } from '../src/ingest/sources/remoteok.js'
import type { Source } from '../src/ingest/types.js'
import type { Job } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

// Real jobs recorded from each board's public API, with long descriptions cut short
const REMOTE_FIXTURES = new URL('remote/', FIXTURES_DIR)
const readFixture = async (name: string) => readFile(new URL(name, REMOTE_FIXTURES), 'utf8')

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }

// Answers by URL; anything else is a 404
function fakeFetch (routes: Record<string, string>) {
  const urls: string[] = []
  const fetch = async (url: string | URL | Request) => {
    urls.push(String(url))
    const body = routes[String(url)]
    return body === undefined
      ? new Response('Not found', { status: 404 })
      : new Response(body, { headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch: fetch as typeof globalThis.fetch, urls }
}

const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, retries: 0, sleep: async () => {} })

async function collect<Raw> (source: Source<Raw>) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger: silent })) {
    jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  }
  return jobs
}

describe('parseRemoteLocation', () => {
  test('keeps remote jobs open to US-based applicants', () => {
    for (const text of ['', null, 'Worldwide', 'Remote', 'Anywhere']) {
      assert.deepEqual(parseRemoteLocation(text), { city: null, state: null, country: null, remote: true }, String(text))
    }
    assert.deepEqual(parseRemoteLocation('Remote - US'), { city: null, state: null, country: 'US', remote: true })
    assert.deepEqual(parseRemoteLocation('Boston'), { city: 'Boston', state: 'MA', country: 'US', remote: true })
    assert.deepEqual(parseRemoteLocation('Your Remote US Home Office'), { city: null, state: null, country: 'US', remote: true })
  })

  test('drops jobs limited to other countries', () => {
    for (const text of ['United Kingdom', 'Germany', 'Toronto, Ontario', 'Europe']) {
      assert.equal(parseRemoteLocation(text), null, text)
    }
  })
})

describe('Remote OK source', () => {
  test('skips the legal notice and keeps the tech jobs open to US-based applicants', async () => {
    const { fetch, urls } = fakeFetch({ [REMOTEOK_URL]: await readFixture('remoteok.json') })

    const jobs = await collect(createRemoteOkSource({ http: testHttp(fetch) }))

    assert.deepEqual(urls, [REMOTEOK_URL])
    // Dropped: "Senior Software Engineer LATAM", a wind turbine technician and a job in the UK
    assert.deepEqual(jobs.map((job) => [job.sourceId, job.title, job.location]), [
      ['1137597', 'Front End Developer', 'Remote'],
      ['1137508', 'Principal Software Engineer', 'Remote (Kansas)']
    ])
    const [frontEnd, principal] = jobs
    assert.equal(frontEnd.sourceUrl, 'https://remoteOK.com/remote-jobs/remote-front-end-developer-edconic-1137597')
    assert.deepEqual([frontEnd.salaryMin, frontEnd.salaryMax, frontEnd.country, frontEnd.workplace], [80000, 100000, null, 'remote'])
    assert.deepEqual([principal.state, principal.country, principal.level], ['KS', 'US', 'staff'])
    assert.ok(frontEnd.description.length > 20)
  })

  test('fails the run when the feed is not a list', async () => {
    const { fetch } = fakeFetch({ [REMOTEOK_URL]: JSON.stringify({ error: 'blocked' }) })
    const summary = await ingestSource(createRemoteOkSource({ http: testHttp(fetch) }), { logger: silent, dryRun: true })
    assert.equal(summary.status, 'failed')
    assert.match(String(summary.error), /not a list/)
  })
})

describe('Himalayas source', () => {
  test('pages through each query until an empty page, skips repeats, and keeps US-eligible tech jobs', async () => {
    const page = await readFixture('himalayas-page.json')
    const empty = JSON.stringify({ jobs: [] })
    const { fetch, urls } = fakeFetch({
      [himalayasSearchUrl('developer', 1)]: page,
      [himalayasSearchUrl('developer', 2)]: empty,
      // The same jobs again: listed once
      [himalayasSearchUrl('engineer', 1)]: page,
      [himalayasSearchUrl('engineer', 2)]: empty
    })

    const jobs = await collect(createHimalayasSource({ http: testHttp(fetch), queries: ['developer', 'engineer'], pagesPerQuery: 3 }))

    assert.deepEqual(urls, [
      'https://himalayas.app/jobs/api/search?q=developer&country=US&sort=recent&page=1',
      'https://himalayas.app/jobs/api/search?q=developer&country=US&sort=recent&page=2',
      'https://himalayas.app/jobs/api/search?q=engineer&country=US&sort=recent&page=1',
      'https://himalayas.app/jobs/api/search?q=engineer&country=US&sort=recent&page=2'
    ])
    // Dropped: an account lead in sales and a structural engineer
    assert.equal(jobs.length, 2)
    const [flightControls, codingTasks] = jobs
    assert.equal(flightControls.title, 'Lead Flight Controls & Software Engineer – Special Programs')
    assert.equal(flightControls.location, 'Remote (US)')
    assert.match(flightControls.sourceUrl, /^https:\/\/himalayas\.app\/companies\/wearearcher\/jobs\/.+\?utm_source=api$/, 'the applicationLink, unchanged')
    assert.equal(flightControls.sourceId, 'https://himalayas.app/companies/wearearcher/jobs/lead-flight-controls-software-engineer-special-programs')
    assert.deepEqual([flightControls.salaryMin, flightControls.salaryMax], [138200, 190100])
    assert.equal(flightControls.postedAt, '2026-10-31T00:19:42Z')

    assert.deepEqual([codingTasks.location, codingTasks.country], ['Remote', null], 'no location restriction: open worldwide')
    assert.deepEqual([codingTasks.salaryMin, codingTasks.employmentType], [null, 'contract'], 'an hourly rate is not stored')
  })

  test('drops expired jobs', async () => {
    const { jobs } = JSON.parse(await readFixture('himalayas-page.json')) as { jobs: HimalayasJob[] }
    const expired = jobs.map((job) => ({ ...job, expiryDate: 1_000_000_000 }))
    const { fetch } = fakeFetch({ [himalayasSearchUrl('developer', 1)]: JSON.stringify({ jobs: expired }) })

    assert.deepEqual(await collect(createHimalayasSource({ http: testHttp(fetch), queries: ['developer'], pagesPerQuery: 1 })), [])
  })
})

describe('Jobicy source', () => {
  test('follows the cursor and keeps the tech jobs open to US-based applicants', async () => {
    const { fetch, urls } = fakeFetch({
      [jobicyUrl()]: await readFixture('jobicy-page-1.json'),
      [jobicyUrl('cursor-2')]: await readFixture('jobicy-page-2.json')
    })

    const jobs = await collect(createJobicySource({ http: testHttp(fetch) }))

    assert.deepEqual(urls, ['https://jobicy.com/api/jobs?count=100&geo=usa', 'https://jobicy.com/api/jobs?count=100&geo=usa&cursor=cursor-2'])
    // Dropped: a sales role, and a marketing role
    assert.deepEqual(jobs.map((job) => [job.sourceId, job.location, job.salaryMin]), [
      ['158129', 'Remote (US)', 150000],
      ['158064', 'Remote (US)', null]
    ])
    assert.equal(jobs[0].sourceUrl, 'https://jobicy.com/jobs/158129-senior-fullstack-engineer-be-leaning', 'apply links stay on Jobicy')
    assert.equal(jobs[1].level, 'staff')
  })
})

describe('GET /jobs/:id', () => {
  test('credits the source of an ingested job and links to the original posting', async () => {
    const { fetch } = fakeFetch({ [REMOTEOK_URL]: await readFixture('remoteok.json') })
    await ingestSource(createRemoteOkSource({ http: testHttp(fetch) }), { logger: silent })

    const list = await request(app).get('/jobs').query({ text: 'Front End Developer', limit: 50 })
    const job = (list.body.data as Job[]).find((candidate) => candidate.source?.name === 'Remote OK')!
    const detail = await request(app).get(`/jobs/${job.id}`)

    assert.deepEqual(detail.body.source, {
      name: 'Remote OK',
      url: 'https://remoteOK.com/remote-jobs/remote-front-end-developer-edconic-1137597'
    })
  })

  test('has no source for jobs created here', async () => {
    const list = await request(app).get('/jobs').query({ text: 'Lumen Labs' })
    assert.equal((list.body.data as Job[])[0].source, null)
  })
})
