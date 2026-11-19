import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, describe, test } from 'node:test'
import { ATS_PLATFORMS, COMPANIES, companiesSchema, type Company } from '../src/ingest/companies.js'
import { createHttpClient, USER_AGENT } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { createAshbySource } from '../src/ingest/sources/ashby.js'
import { FIXTURES_DIR } from '../src/ingest/sources/fixture.js'
import { createGreenhouseSource } from '../src/ingest/sources/greenhouse.js'
import { resolveSources } from '../src/ingest/sources/index.js'
import { createLeverSource } from '../src/ingest/sources/lever.js'
import { createSmartRecruitersSource, smartRecruitersListUrl, smartRecruitersPostingUrl } from '../src/ingest/sources/smartrecruiters.js'
import type { Source } from '../src/ingest/types.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'

// Real postings recorded from public boards, with long descriptions cut short
const ATS_FIXTURES = new URL('ats/', FIXTURES_DIR)
const readFixture = async (name: string) => readFile(new URL(name, ATS_FIXTURES), 'utf8')

const company = (ats: Company['ats'], token: string, name = token): Company =>
  ({ name, ats, token, website: `https://${token}.example.com` })

// Answers by URL; anything else is a 404, like a board token that no longer exists
function fakeFetch (routes: Record<string, () => Response>) {
  const calls: Array<{ url: string, init: RequestInit }> = []
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const route = routes[String(url)]
    return route ? route() : new Response('Not found', { status: 404 })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const jsonResponse = (body: string) => () => new Response(body, { headers: { 'Content-Type': 'application/json' } })

// No waiting between retries
const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, sleep: async () => {} })

function recordingLogger () {
  const infos: string[] = []
  const warnings: string[] = []
  const logger: Logger = {
    info: (message: string) => { infos.push(message) },
    warn: (message: string) => { warnings.push(message) },
    error: (message: string) => { warnings.push(message) }
  }
  return { logger, infos, warnings }
}

// Fetches and normalizes every job the source keeps, validated like the runner does
async function collect<Raw> (source: Source<Raw>, logger = recordingLogger().logger) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger })) {
    jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  }
  return jobs
}

describe('companies.json', () => {
  test('lists 50+ valid companies, on every supported ATS, each board once', () => {
    assert.ok(COMPANIES.length >= 50, `only ${COMPANIES.length} companies`)
    for (const ats of ATS_PLATFORMS) {
      assert.ok(COMPANIES.some((entry) => entry.ats === ats), `no company on ${ats}`)
    }
  })

  test('rejects a board listed twice and a token that does not fit in a URL', () => {
    const duplicate = companiesSchema.safeParse([company('lever', 'acme'), company('lever', 'ACME')])
    assert.equal(duplicate.success, false)
    assert.match(duplicate.error!.issues[0].message, /lever\/acme is listed more than once/)

    const badToken = companiesSchema.safeParse([company('ashby', 'acme/../admin')])
    assert.equal(badToken.success, false)

    // The same token on two different platforms is two different boards
    assert.equal(companiesSchema.safeParse([company('lever', 'acme'), company('ashby', 'acme')]).success, true)
  })

  test('a full run includes every ATS source, which only list open jobs and rank first', () => {
    const sources = resolveSources([], { isLocalDatabase: false })
    const ats = sources.filter((source) => ATS_PLATFORMS.some((platform) => platform === source.id))
    assert.deepEqual(ats.map((source) => source.id), ['greenhouse', 'lever', 'ashby', 'smartrecruiters'])
    assert.ok(ats.every((source) => source.listsOnlyOpenJobs && source.priority === 0))
  })
})

describe('Greenhouse source', () => {
  const discord = company('greenhouse', 'discord', 'Discord')
  const url = 'https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true&pay_transparency=true'

  test('keeps the US tech roles and maps them, decoding the escaped HTML', async () => {
    const { fetch, calls } = fakeFetch({ [url]: jsonResponse(await readFixture('greenhouse-board.json')) })
    const source = createGreenhouseSource({ companies: [discord], http: testHttp(fetch) })

    const jobs = await collect(source)

    assert.equal(calls.length, 1)
    assert.equal((calls[0].init.headers as Record<string, string>)['User-Agent'], USER_AGENT)
    // Dropped: a product manager, and an engineer in Toronto
    assert.deepEqual(jobs.map((job) => job.title), ['QA/DevOps Engineer', 'Engineering Manager, Machine Learning (Safety)'])

    const [qa, manager] = jobs
    assert.deepEqual(
      {
        sourceId: qa.sourceId,
        sourceUrl: qa.sourceUrl,
        company: qa.company,
        location: qa.location,
        city: qa.city,
        state: qa.state,
        country: qa.country,
        remote: qa.remote,
        salaryMin: qa.salaryMin,
        salaryMax: qa.salaryMax,
        currency: qa.currency,
        postedAt: qa.postedAt
      },
      {
        sourceId: 'discord:8703614002',
        sourceUrl: 'https://job-boards.greenhouse.io/discord/jobs/8703614002',
        company: 'Discord',
        location: 'San Francisco Bay Area, CA',
        city: 'San Francisco Bay Area',
        state: 'CA',
        country: 'US',
        remote: false,
        salaryMin: 156000,
        salaryMax: 175500,
        currency: 'USD',
        postedAt: qa.postedAt
      }
    )
    assert.ok(qa.postedAt?.endsWith('Z'))
    assert.ok(qa.descriptionHtml?.startsWith('<'), 'the stored HTML is decoded')
    assert.doesNotMatch(qa.description, /&lt;|&gt;|&quot;|<\w/, 'the text has neither entities nor tags')
    assert.match(qa.description, /\n\n/, 'paragraphs survive')

    assert.equal(manager.location, 'Remote (US)')
    assert.equal(manager.workplace, 'remote')
    assert.equal(manager.level, 'lead')
    assert.deepEqual([manager.salaryMin, manager.salaryMax], [272000, 340000])
  })

  test('trusts a location name abroad over a US office attached to every posting', async () => {
    const job = (id: number, name: string) => ({
      id,
      title: 'Principal Software Engineer',
      absolute_url: `https://job-boards.greenhouse.io/discord/jobs/${id}`,
      location: { name },
      offices: [{ name: 'US', location: 'United States' }],
      content: '&lt;p&gt;Build search infrastructure for everyone.&lt;/p&gt;'
    })
    const body = JSON.stringify({ jobs: [job(1, 'Portugal'), job(2, 'United States'), job(3, 'Anywhere we hire')] })
    const { fetch } = fakeFetch({ [url]: jsonResponse(body) })

    const jobs = await collect(createGreenhouseSource({ companies: [discord], http: testHttp(fetch) }))

    assert.deepEqual(jobs.map((kept) => [kept.sourceId, kept.location]), [['discord:2', 'United States'], ['discord:3', 'United States']])
  })
})

describe('Lever source', () => {
  const wealthfront = company('lever', 'wealthfront', 'Wealthfront')

  test('keeps the US tech roles, with the salary range when the posting has one', async () => {
    const url = 'https://api.lever.co/v0/postings/wealthfront?mode=json'
    const { fetch } = fakeFetch({ [url]: jsonResponse(await readFixture('lever-board.json')) })

    const jobs = await collect(createLeverSource({ companies: [wealthfront], http: testHttp(fetch) }))

    // Dropped: an engineer in London, an administrative role and a mechanical engineer
    assert.deepEqual(jobs.map((job) => job.title), ['Android Engineer', 'Embedded Software Engineer'])
    const [android, embedded] = jobs
    assert.equal(android.sourceId, 'wealthfront:78d6f6d5-1f08-4d5d-87be-c4250567bfb5')
    assert.equal(android.location, 'Palo Alto, CA')
    assert.equal(android.workplace, 'hybrid')
    assert.equal(android.company, 'Wealthfront')
    assert.equal(android.postedAt, '2023-09-11T20:23:16Z')
    assert.deepEqual([android.salaryMin, android.salaryMax], [null, null])
    assert.match(android.description, /- Build a premier native Android application/, 'the lists become bullets')

    assert.equal(embedded.location, 'San Diego, CA')
    assert.deepEqual([embedded.salaryMin, embedded.salaryMax, embedded.currency], [164000, 223000, 'USD'])
  })
})

describe('Ashby source', () => {
  const ramp = company('ashby', 'ramp', 'Ramp')

  test('keeps the US tech roles and maps the yearly salary', async () => {
    const url = 'https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true'
    const { fetch } = fakeFetch({ [url]: jsonResponse(await readFixture('ashby-board.json')) })

    const jobs = await collect(createAshbySource({ companies: [ramp], http: testHttp(fetch) }))

    // Dropped: an account executive, and a remote role in Europe
    assert.equal(jobs.length, 1)
    const [security] = jobs
    assert.equal(security.title, 'Security Engineer, Cloud')
    assert.equal(security.sourceUrl, 'https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245')
    assert.equal(security.location, 'New York, NY')
    // `isRemote` is true, but the posting says hybrid
    assert.deepEqual([security.workplace, security.remote], ['hybrid', false])
    assert.deepEqual([security.salaryMin, security.salaryMax], [211400, 290600])
    assert.equal(security.employmentType, 'full-time')
    assert.equal(security.postedAt, '2026-04-07T17:12:35Z')
  })
})

describe('SmartRecruiters source', () => {
  const serviceNow = company('smartrecruiters', 'ServiceNow', 'ServiceNow')
  const listUrl = smartRecruitersListUrl(serviceNow, 0)

  async function routes () {
    const details = JSON.parse(await readFixture('smartrecruiters-postings.json')) as Record<string, unknown>
    return {
      [listUrl]: jsonResponse(await readFixture('smartrecruiters-list.json')),
      ...Object.fromEntries(Object.entries(details).map(([id, posting]) =>
        [smartRecruitersPostingUrl(serviceNow, id), jsonResponse(JSON.stringify(posting))]))
    }
  }

  test('lists US postings only, and fetches the details of the kept ones', async () => {
    const { fetch, calls } = fakeFetch(await routes())
    const { logger, infos } = recordingLogger()

    const jobs = await collect(createSmartRecruitersSource({ companies: [serviceNow], http: testHttp(fetch) }), logger)

    assert.equal(listUrl, 'https://api.smartrecruiters.com/v1/companies/ServiceNow/postings?country=us&limit=100&offset=0')
    // Dropped without a details request: a "Solution ... Engineer" in Support, and a sales role
    assert.deepEqual(jobs.map((job) => job.title), ['Senior Software Engineer', 'Sr Staff Software Engineer'])
    assert.equal(calls.length, 3)
    assert.deepEqual(infos, ['[smartrecruiters] ServiceNow: kept 2 of 4 postings'])

    const [onsite, remote] = jobs
    assert.equal(onsite.sourceId, 'ServiceNow:744000162575369')
    assert.equal(onsite.sourceUrl, 'https://jobs.smartrecruiters.com/ServiceNow/744000162575369-senior-software-engineer')
    assert.equal(onsite.company, 'ServiceNow')
    assert.deepEqual([onsite.location, onsite.city, onsite.state, onsite.workplace], ['San Diego, CA', 'San Diego', 'CA', 'onsite'])
    assert.equal(onsite.employmentType, 'full-time')
    assert.equal(onsite.postedAt, '2026-11-19T17:48:59Z')
    assert.match(onsite.descriptionHtml ?? '', /^<h3>Company Description<\/h3>/)
    assert.match(onsite.description, /Job Description/, 'every section is kept under its heading')

    // "Albany, NEW YORK": the state name in capitals
    assert.deepEqual([remote.location, remote.remote, remote.workplace], ['Remote (Albany, NY)', true, 'remote'])
  })

  test('pages through a large board, and skips a posting whose details fail', async () => {
    const posting = (id: number) => ({
      id: String(id),
      name: 'Backend Engineer',
      releasedDate: '2026-11-18T10:00:00.000Z',
      location: { city: 'Austin', region: 'TX', country: 'us', remote: false, hybrid: true },
      department: { label: 'Engineering' }
    })
    const page = (offset: number, count: number) => jsonResponse(JSON.stringify({
      offset,
      limit: 100,
      totalFound: 150,
      content: Array.from({ length: count }, (_, index) => posting(offset + index))
    }))
    const detailRoutes = Object.fromEntries(Array.from({ length: 150 }, (_, id) => [
      smartRecruitersPostingUrl(serviceNow, String(id)),
      jsonResponse(JSON.stringify({
        ...posting(id),
        postingUrl: `https://jobs.smartrecruiters.com/ServiceNow/${id}`,
        jobAd: { sections: { jobDescription: { title: 'Job Description', text: '<p>Build the APIs behind our workflow platform.</p>' } } }
      }))
    ]))
    // Posting 7 was taken down between the list and its details
    delete detailRoutes[smartRecruitersPostingUrl(serviceNow, '7')]
    const { fetch, calls } = fakeFetch({
      [smartRecruitersListUrl(serviceNow, 0)]: page(0, 100),
      [smartRecruitersListUrl(serviceNow, 100)]: page(100, 50),
      ...detailRoutes
    })
    const { logger, infos } = recordingLogger()

    const jobs = await collect(createSmartRecruitersSource({ companies: [serviceNow], http: testHttp(fetch) }), logger)

    assert.equal(calls.filter((call) => call.url.includes('?country=us')).length, 2)
    assert.equal(jobs.length, 149)
    assert.equal(jobs[0].workplace, 'hybrid')
    assert.deepEqual(infos, ['[smartrecruiters] ServiceNow: kept 149 of 150 postings (1 more without details, skipped)'])
  })

  test('inspecting a board reads the list only', async () => {
    const { fetch, calls } = fakeFetch(await routes())
    const source = createSmartRecruitersSource({ companies: [], http: testHttp(fetch) })

    assert.deepEqual(await source.inspectBoard(serviceNow), { total: 4, kept: 2 })
    assert.equal(calls.length, 1)
  })
})

describe('a board that fails', () => {
  before(async () => { await runMigrations() })

  test('is logged and skipped while the other boards are still stored', async () => {
    const { fetch } = fakeFetch({
      'https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true':
        jsonResponse(await readFixture('ashby-board.json')),
      // The API changed: not the shape the adapter knows
      'https://api.ashbyhq.com/posting-api/job-board/changed?includeCompensation=true':
        jsonResponse(JSON.stringify({ postings: [] }))
    })
    const companies = [company('ashby', 'renamed', 'Renamed Co'), company('ashby', 'ramp', 'Ramp'), company('ashby', 'changed', 'Changed Co')]
    const source = createAshbySource({ companies, http: testHttp(fetch) })
    const { logger, infos, warnings } = recordingLogger()

    const summary = await ingestSource(source, { logger })

    assert.equal(summary.status, 'succeeded')
    assert.deepEqual([summary.fetched, summary.inserted, summary.failed], [1, 1, 0])
    assert.deepEqual(warnings, [
      '[ashby] skipped Renamed Co (renamed): GET https://api.ashbyhq.com/posting-api/job-board/renamed?includeCompensation=true responded 404',
      '[ashby] skipped Changed Co (changed): unexpected response: jobs is not a list'
    ])
    assert.deepEqual(infos, ['[ashby] Ramp: kept 1 of 3 postings'])

    const { rows } = await db.execute({ sql: 'SELECT company, source_id FROM jobs WHERE source = ?', args: [source.id] })
    assert.deepEqual(rows.map((row) => [row.company, row.source_id]), [['Ramp', 'ramp:34413f8d-26bf-4bbc-8ade-eb309a0e2245']])
  })
})
