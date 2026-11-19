import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { db } from '../src/db/database.js'
import { createHttpClient } from '../src/ingest/http.js'
import { ingestSource, type Logger } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { missingEnv, splitConfiguredSources } from '../src/ingest/sources/index.js'
import {
  USAJOBS_RESULTS_PER_PAGE,
  createUsaJobsSource,
  easternTimeToIso,
  normalizeUsaJobsJob,
  usaJobsUrl,
  type UsaJobsDescriptor,
  type UsaJobsItem
} from '../src/ingest/sources/usajobs.js'
import type { Job } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }
// Test values only: the real ones are repository secrets
const KEYS = { USAJOBS_API_KEY: 'test-key', USAJOBS_USER_AGENT: 'ingest@example.com' }

// Shaped like a real item of GET /api/search?Fields=Full
const usaJob = (id: string | number = '812345600', overrides: Partial<UsaJobsDescriptor> = {}): UsaJobsItem => ({
  MatchedObjectId: id,
  MatchedObjectDescriptor: {
    PositionID: 'CISA-12345678-MP',
    PositionTitle: 'IT Specialist (APPSW)',
    PositionURI: `https://www.usajobs.gov:443/job/${id}`,
    PositionLocationDisplay: 'Arlington, Virginia',
    PositionLocation: [{
      LocationName: 'Arlington, Virginia',
      CountryCode: 'United States',
      CountrySubDivisionCode: 'Virginia',
      CityName: 'Arlington, Virginia'
    }],
    OrganizationName: 'Cybersecurity and Infrastructure Security Agency',
    DepartmentName: 'Department of Homeland Security',
    JobCategory: [{ Name: 'Information Technology Management', Code: '2210' }],
    JobGrade: [{ Code: 'GS' }],
    PositionSchedule: [{ Name: 'Full-time', Code: '1' }],
    PositionOfferingType: [{ Name: 'Permanent', Code: '15317' }],
    QualificationSummary: 'You must have one year of specialized experience developing web applications in Python &amp; TypeScript.',
    PositionRemuneration: [{ MinimumRange: '120579.0', MaximumRange: '156755.0', RateIntervalCode: 'PA', Description: 'Per Year' }],
    PublicationStartDate: '2026-11-18T00:00:00.0000',
    ApplicationCloseDate: '2026-12-02T23:59:59.9970',
    UserArea: {
      Details: {
        JobSummary: 'Join CISA to build the applications that protect federal networks.',
        MajorDuties: ['Develops and maintains web applications.', 'Reviews code <and> designs APIs.'],
        LowGrade: '13',
        HighGrade: '13',
        TeleworkEligible: true,
        RemoteIndicator: false
      }
    },
    ...overrides
  }
})

function fakeFetch (pages: Record<number, UsaJobsItem[]>, status = 200) {
  const requests: Array<{ url: string, headers: Record<string, string> }> = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } })
    const page = Number(new URL(String(url)).searchParams.get('Page'))
    if (status !== 200) return new Response('Unauthorized', { status })
    const items = pages[page] ?? []
    return new Response(JSON.stringify({
      SearchResult: { SearchResultCount: items.length, SearchResultCountAll: 999, SearchResultItems: items, UserArea: { NumberOfPages: '9' } }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch: fetch as typeof globalThis.fetch, requests }
}

const testHttp = (fetch: typeof globalThis.fetch) => createHttpClient({ fetch, retries: 0, sleep: async () => {} })

const fullPage = (page: number) => Array.from({ length: USAJOBS_RESULTS_PER_PAGE }, (_, index) => usaJob(`${page}${index}`))

async function collect (source: ReturnType<typeof createUsaJobsSource>) {
  const jobs = []
  for await (const raw of source.fetchJobs({ logger: silent })) jobs.push(normalizedJobSchema.parse(source.normalize(raw)))
  return jobs
}

const normalize = (item: UsaJobsItem) => normalizedJobSchema.parse(normalizeUsaJobsJob(item))

describe('easternTimeToIso', () => {
  test('reads USAJobs dates as Eastern Time, standard and daylight saving', () => {
    assert.equal(easternTimeToIso('2026-12-02T23:59:59.9970'), '2026-12-03T04:59:59.000Z')
    assert.equal(easternTimeToIso('2026-07-01T00:00:00.0000'), '2026-07-01T04:00:00.000Z')
    assert.equal(easternTimeToIso('2026-11-18'), '2026-11-18T05:00:00.000Z')
    // The day DST ends: 11:59 PM is already back on EST
    assert.equal(easternTimeToIso('2026-11-01T23:59:59'), '2026-11-02T04:59:59.000Z')
  })

  test('keeps an explicit offset and rejects anything else', () => {
    assert.equal(easternTimeToIso('2026-12-02T10:00:00Z'), '2026-12-02T10:00:00.000Z')
    assert.equal(easternTimeToIso('2026-12-02T10:00:00-05:00'), '2026-12-02T15:00:00.000Z')
    assert.equal(easternTimeToIso('next Tuesday'), null)
    assert.equal(easternTimeToIso(null), null)
  })
})

describe('USAJobs source', () => {
  test('asks for IT and computer science jobs, newest first, 500 a page', () => {
    const url = new URL(usaJobsUrl(2))
    assert.equal(url.origin + url.pathname, 'https://data.usajobs.gov/api/search')
    assert.equal(url.searchParams.get('JobCategoryCode'), '2210;1550')
    assert.equal(url.searchParams.get('ResultsPerPage'), '500')
    assert.equal(url.searchParams.get('Page'), '2')
    assert.equal(url.searchParams.get('SortField'), 'opendate')
    assert.equal(url.searchParams.get('SortDirection'), 'desc')
  })

  test('maps a job: agency, place, yearly salary, grade, telework, dates and description', () => {
    const job = normalize(usaJob())
    assert.equal(job.sourceId, '812345600')
    assert.equal(job.sourceUrl, 'https://www.usajobs.gov/job/812345600')
    assert.equal(job.title, 'IT Specialist (APPSW)')
    assert.equal(job.company, 'Cybersecurity and Infrastructure Security Agency')
    assert.equal(job.location, 'Arlington, VA')
    assert.equal(job.state, 'VA')
    assert.equal(job.remote, false)
    assert.equal(job.workplace, 'hybrid')
    assert.equal(job.level, 'senior')
    assert.equal(job.employmentType, 'full-time')
    assert.equal(job.salaryMin, 120579)
    assert.equal(job.salaryMax, 156755)
    assert.equal(job.postedAt, '2026-11-18T05:00:00Z')
    assert.equal(job.closesAt, '2026-12-03T04:59:59Z')
    assert.match(job.descriptionHtml!, /<h3>Duties<\/h3>/)
    assert.match(job.descriptionHtml!, /<li>Reviews code &lt;and&gt; designs APIs\.<\/li>/)
    assert.match(job.description, /Python & TypeScript/)
  })

  test('reads remote jobs, hourly pay, part-time, internships and supervisory roles', () => {
    const remote = normalize(usaJob('1', {
      PositionLocationDisplay: 'Anywhere in the U.S. (remote job)',
      PositionLocation: [{ LocationName: 'Anywhere in the U.S. (remote job)', CountryCode: 'United States' }]
    }))
    assert.equal(remote.location, 'Remote (US)')
    assert.equal(remote.workplace, 'remote')

    const hourly = normalize(usaJob('2', { PositionRemuneration: [{ MinimumRange: '25.10', MaximumRange: '32.6', RateIntervalCode: 'PH' }] }))
    assert.equal(hourly.salaryMin, null)
    assert.equal(hourly.salaryMax, null)

    assert.equal(normalize(usaJob('3', { PositionSchedule: [{ Name: 'Part-time', Code: '2' }] })).employmentType, 'part-time')
    assert.equal(normalize(usaJob('4', { PositionOfferingType: [{ Name: 'Internships' }] })).employmentType, 'internship')
    assert.equal(normalize(usaJob('5', { PositionOfferingType: [{ Name: 'Term' }] })).employmentType, 'contract')
    assert.equal(normalize(usaJob('6', { PositionTitle: 'Supervisory IT Specialist (INFOSEC)' })).level, 'lead')
  })

  test('drops jobs whose only duty stations are overseas', () => {
    assert.throws(() => normalizeUsaJobsJob(usaJob('7', {
      PositionLocation: [{ LocationName: 'Ramstein AB, Germany', CountryCode: 'Germany', CityName: 'Ramstein AB, Germany' }]
    })), /not in the US/)
  })

  test('sends the key and the User-Agent from the environment, page by page until a short page', async () => {
    const { fetch, requests } = fakeFetch({ 1: fullPage(1), 2: [usaJob('last')] })
    const waits: number[] = []
    const source = createUsaJobsSource({ http: testHttp(fetch), env: KEYS, sleep: async (ms) => { waits.push(ms) } })
    const jobs = await collect(source)
    assert.equal(jobs.length, USAJOBS_RESULTS_PER_PAGE + 1)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].headers['Authorization-Key'], 'test-key')
    assert.equal(requests[0].headers['User-Agent'], 'ingest@example.com')
    assert.deepEqual(waits, [1000])
  })

  test('fails the run on an error response, so no job is closed for missing', async () => {
    const { fetch } = fakeFetch({}, 401)
    const source = createUsaJobsSource({ http: testHttp(fetch), env: KEYS })
    await assert.rejects(collect(source), (error: Error) => {
      assert.match(error.message, /401/)
      assert.doesNotMatch(error.message, /test-key/)
      return true
    })
  })

  test('is skipped while its key or User-Agent is unset', () => {
    const source = createUsaJobsSource()
    assert.deepEqual(missingEnv(source, {}), ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'])
    assert.deepEqual(missingEnv(source, KEYS), [])
    const { unconfigured } = splitConfiguredSources([source], { USAJOBS_API_KEY: 'x' })
    assert.deepEqual(unconfigured[0].missing, ['USAJOBS_USER_AGENT'])
  })
})

describe('USAJobs jobs in the API', () => {
  test('show their salary and deadline, and close once the deadline has passed', async () => {
    const open = usaJob('open-job', { PositionTitle: 'IT Specialist (Data Management)', PublicationStartDate: '2025-12-20T00:00:00.0000', ApplicationCloseDate: '2099-01-15T23:59:59.9970' })
    const past = usaJob('past-deadline', { PositionTitle: 'IT Specialist (Network Services)', PublicationStartDate: '2025-12-20T00:00:00.0000', ApplicationCloseDate: '2026-01-10T23:59:59.9970' })
    const { fetch } = fakeFetch({ 1: [open, past] })
    const source = createUsaJobsSource({ http: testHttp(fetch), env: KEYS, sleep: async () => {} })

    const first = await ingestSource(source, { logger: silent, now: new Date('2026-01-01T12:00:00Z') })
    assert.equal(first.inserted, 2)
    assert.equal(first.closed, 0)

    // Its deadline (January 2026) has passed by the real clock: hidden even before a run closes it
    let response = await request(app).get('/jobs').query({ source: 'usajobs' })
    const titles = (response.body.data as Job[]).map((job) => job.title)
    assert.ok(titles.includes('IT Specialist (Data Management)'))
    assert.ok(!titles.includes('IT Specialist (Network Services)'))

    const job = (response.body.data as Job[]).find((candidate) => candidate.title === 'IT Specialist (Data Management)')!
    assert.equal(job.closesAt, '2099-01-16T04:59:59Z')
    assert.equal(job.salaryMin, 120579)
    assert.deepEqual(job.source, { id: 'usajobs', name: 'USAJOBS', publisher: null, url: 'https://www.usajobs.gov/job/open-job', credit: null })

    // The next run after the deadline closes it, though the API still lists it
    const later = await ingestSource(source, { logger: silent, now: new Date('2026-01-11T12:00:00Z') })
    assert.equal(later.closed, 1)
    const { rows } = await db.execute("SELECT source_id, closed_at FROM jobs WHERE source = 'usajobs' ORDER BY source_id")
    assert.deepEqual(rows.map((row) => [row.source_id, row.closed_at]), [['open-job', null], ['past-deadline', '2026-01-11T12:00:00Z']])

    response = await request(app).get(`/jobs/${job.id}`)
    assert.equal(response.status, 200)
    assert.match(response.body.descriptionHtml, /<h3>Qualifications<\/h3>/)
  })
})
