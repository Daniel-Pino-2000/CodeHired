import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { db } from '../src/db/database.js'
import { SEED_JOBS } from '../src/db/seed-data.js'
import { runIngestion } from '../src/ingest/runner.js'
import { createFixtureSource, FIXTURES_DIR } from '../src/ingest/sources/fixture.js'
import { CompanyModel } from '../src/models/company.js'
import { JobModel } from '../src/models/job.js'
import type { Company, Job, Paginated } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const job = (company: string, title = 'Backend Engineer') => ({
  title,
  company,
  location: 'Remote',
  workplace: 'remote' as const,
  level: 'mid' as const,
  employmentType: 'full-time' as const,
  salaryMin: null,
  salaryMax: null,
  currency: 'USD',
  technologies: [],
  description: 'A job to check how jobs are grouped by company.'
})

async function getCompany (slug: string) {
  const res = await request(app).get(`/companies/${slug}`)
  return { res, body: res.body as Company }
}

async function jobsOf (slug: string) {
  const res = await request(app).get('/jobs').query({ company: slug, limit: 50 })
  assert.equal(res.status, 200)
  return res.body as Paginated<Job>
}

describe('companies', () => {
  test('every seed job is linked to its company, and jobs say which one', async () => {
    const res = await request(app).get('/jobs').query({ limit: 50 })
    const jobs = (res.body as Paginated<Job>).data
    assert.equal(jobs.length, SEED_JOBS.length)
    for (const listed of jobs) {
      assert.ok(listed.companyProfile, `${listed.company} has a company`)
      assert.equal(listed.companyProfile.name, listed.company)
      assert.match(listed.companyProfile.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
    }

    const detail = await request(app).get(`/jobs/${jobs[0].id}`)
    assert.deepEqual(detail.body.companyProfile, jobs[0].companyProfile)
  })

  test('names that only differ in case, punctuation or legal suffix are one company', async () => {
    await JobModel.create(job('Grouping Labs, Inc.', 'Frontend Engineer'))
    await JobModel.create(job('GROUPING LABS', 'Data Engineer'))
    await JobModel.create(job('grouping labs llc', 'Platform Engineer'))

    const { res, body } = await getCompany('grouping-labs')
    assert.equal(res.status, 200)
    assert.equal(body.name, 'Grouping Labs, Inc.', 'the first name seen')
    assert.equal(body.openJobs, 3)
    const jobs = await jobsOf('grouping-labs')
    assert.equal(jobs.total, 3)
    assert.ok(jobs.data.every((listed) => listed.companyProfile?.slug === 'grouping-labs'))
  })

  test('a company page counts and lists only its open jobs', async () => {
    const kept = await JobModel.create(job('Countco', 'Engineer A'))
    const closed = await JobModel.create(job('Countco', 'Engineer B'))
    const copy = await JobModel.create(job('Countco', 'Engineer C'))
    await JobModel.create(job('Othercount', 'Engineer D'))
    await db.execute({ sql: "UPDATE jobs SET closed_at = '2026-01-01T00:00:00Z' WHERE id = ?", args: [closed.id] })
    await db.execute({ sql: 'UPDATE jobs SET duplicate_of = ? WHERE id = ?', args: [kept.id, copy.id] })

    const { body } = await getCompany('countco')
    const jobs = await jobsOf('countco')
    assert.equal(body.openJobs, 1)
    assert.equal(jobs.total, 1)
    assert.deepEqual(jobs.data.map((listed) => listed.id), [kept.id])
  })

  test('the company filter combines with the others', async () => {
    await JobModel.create({ ...job('Combico', 'Senior Engineer'), level: 'senior' })
    await JobModel.create(job('Combico', 'Engineer'))

    const res = await request(app).get('/jobs').query({ company: 'combico', level: 'senior' })
    assert.deepEqual((res.body as Paginated<Job>).data.map((listed) => listed.title), ['Senior Engineer'])
  })

  test('companies.json sets the name, website and ATS of the boards CodeHired reads', async () => {
    await JobModel.create(job('Knownboard Inc'))
    await CompanyModel.syncKnown([{ name: 'KnownBoard', ats: 'lever', token: 'knownboard', website: 'https://knownboard.example' }])

    const { body } = await getCompany('knownboard')
    assert.deepEqual(
      [body.name, body.website, body.ats, body.openJobs],
      ['KnownBoard', 'https://knownboard.example', 'lever', 1]
    )
  })

  test('a company that stopped hiring still has a page; unknown and malformed slugs are 404', async () => {
    await CompanyModel.syncKnown([{ name: 'Quietco', ats: 'ashby', token: 'quietco', website: 'https://quietco.example' }])
    const quiet = await getCompany('quietco')
    assert.equal(quiet.res.status, 200)
    assert.equal(quiet.body.openJobs, 0)

    for (const slug of ['nobody-here', 'Not%20A%20Slug', '-dash']) {
      const { res } = await getCompany(slug)
      assert.equal(res.status, 404, slug)
      assert.equal(res.body.error, 'Company not found')
    }
  })

  test('a name made only of a legal suffix is not a company', async () => {
    const created = await JobModel.create(job('LLC'))
    assert.equal(created.companyProfile, null)
  })

  test('ingestion links the jobs it writes', async () => {
    await runIngestion([createFixtureSource(new URL('jobs.json', FIXTURES_DIR), 'fixture-companies')], { logger: { info () {}, warn () {}, error () {} } })

    const { rows } = await db.execute("SELECT COUNT(*) AS unlinked FROM jobs WHERE source = 'fixture-companies' AND company_id IS NULL")
    assert.equal(Number(rows[0].unlinked), 0)
    const { body } = await getCompany('copperline-analytics')
    assert.ok(body.openJobs >= 1)
  })
})

describe('GET /companies', () => {
  test('lists companies with open jobs, the most open jobs first, with counts that match GET /jobs', async () => {
    const res = await request(app).get('/companies').query({ limit: 100 })
    assert.equal(res.status, 200)
    const { data, total } = res.body as Paginated<Company>
    assert.equal(total, data.length)
    assert.ok(data.every((company) => company.openJobs > 0), 'no company without open jobs')
    assert.ok(!data.some((company) => company.slug === 'quietco'))
    const counts = data.map((company) => company.openJobs)
    assert.deepEqual(counts, counts.toSorted((a, b) => b - a))

    for (const company of data.slice(0, 5)) {
      assert.equal((await jobsOf(company.slug)).total, company.openJobs, company.slug)
    }
  })

  test('paginates', async () => {
    const all = (await request(app).get('/companies').query({ limit: 100 })).body as Paginated<Company>
    const page = (await request(app).get('/companies').query({ limit: 2, offset: 2 })).body as Paginated<Company>
    assert.equal(page.total, all.total)
    assert.deepEqual(page.data.map((company) => company.id), all.data.slice(2, 4).map((company) => company.id))
  })

  for (const query of [{ limit: 0 }, { limit: 101 }, { offset: -1 }]) {
    test(`responds 400 for ${JSON.stringify(query)}`, async () => {
      const res = await request(app).get('/companies').query(query)
      assert.equal(res.status, 400)
    })
  }

  test('GET /jobs responds 400 for a malformed company slug', async () => {
    const res = await request(app).get('/jobs').query({ company: 'two  spaces' })
    assert.equal(res.status, 400)
  })
})
