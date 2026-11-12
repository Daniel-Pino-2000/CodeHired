import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { SEED_JOBS } from '../src/db/seed-data.js'
import { JobModel } from '../src/models/job.js'
import type { Job, Paginated } from '../src/types.js'
import { toIsoSeconds } from '../src/utils/dates.js'
import { createTestApp } from './helpers.js'

// The seed jobs, plus a few jobs of one company with known dates
const app = await createTestApp()

const HOUR_MS = 60 * 60 * 1000
const hoursAgo = (hours: number) => toIsoSeconds(new Date(Date.now() - hours * HOUR_MS))

const DATED_COMPANY = 'Datedco'
const datedJob = (title: string, createdAt: string) => ({
  title,
  company: DATED_COMPANY,
  location: 'Denver, CO',
  state: 'CO',
  workplace: 'onsite' as const,
  level: 'mid' as const,
  employmentType: 'full-time' as const,
  salaryMin: null,
  salaryMax: null,
  currency: 'USD',
  technologies: [],
  description: 'A job with a known posting date, for the date filters.',
  createdAt
})
await JobModel.create(datedJob('Posted two hours ago', hoursAgo(2)))
await JobModel.create(datedJob('Posted two days ago', hoursAgo(48)))
await JobModel.create(datedJob('Posted ten days ago', hoursAgo(240)))
await JobModel.create(datedJob('Posted forty days ago', hoursAgo(960)))

const ALL = SEED_JOBS.length + 4
const topSalary = (job: Pick<Job, 'salaryMin' | 'salaryMax'>) => job.salaryMax ?? job.salaryMin

async function getJobs (query: Record<string, string | number | boolean>) {
  const res = await request(app).get('/jobs').query({ limit: 50, ...query })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body as Paginated<Job>
}

describe('GET /jobs filters', () => {
  test('by default, no job is hidden, with or without a salary', async () => {
    const body = await getJobs({})
    assert.equal(body.total, ALL)
    assert.ok(body.data.some((job) => topSalary(job) === null), 'jobs without a salary are listed')
  })

  test('postedWithin keeps the jobs posted inside the window', async () => {
    const titles = async (postedWithin: string) =>
      (await getJobs({ text: DATED_COMPANY, postedWithin })).data.map((job) => job.title)

    assert.deepEqual(await titles('24h'), ['Posted two hours ago'])
    assert.deepEqual(await titles('3d'), ['Posted two hours ago', 'Posted two days ago'])
    assert.deepEqual(await titles('7d'), ['Posted two hours ago', 'Posted two days ago'])
    assert.deepEqual(await titles('30d'), ['Posted two hours ago', 'Posted two days ago', 'Posted ten days ago'])
  })

  test('state matches the US state code, in any case', async () => {
    const texas = await getJobs({ state: 'tx' })
    const expected = SEED_JOBS.filter((job) => job.state === 'TX').length
    assert.ok(expected > 0)
    assert.equal(texas.total, expected)
    assert.ok(texas.data.every((job) => job.location.endsWith(', TX')))

    assert.equal((await getJobs({ state: 'CO' })).total, 4, 'Bogotá, CO in the seed is not Colorado')
  })

  test('employmentType', async () => {
    const body = await getJobs({ employmentType: 'contract' })
    assert.equal(body.total, SEED_JOBS.filter((job) => job.employmentType === 'contract').length)
    assert.ok(body.data.every((job) => job.employmentType === 'contract'))
  })

  test('minSalary matches the top of the range, and leaves out jobs without a salary', async () => {
    const body = await getJobs({ minSalary: 100000 })
    const expected = SEED_JOBS.filter((job) => (topSalary(job) ?? 0) >= 100000)
    assert.equal(body.total, expected.length)
    assert.ok(body.data.every((job) => topSalary(job)! >= 100000))
    assert.equal((await getJobs({ minSalary: 0 })).total, SEED_JOBS.filter((job) => topSalary(job) !== null).length)
  })

  test('hasSalary=true keeps jobs that state one; false is the same as leaving it out', async () => {
    const withSalary = await getJobs({ hasSalary: true })
    assert.equal(withSalary.total, SEED_JOBS.filter((job) => topSalary(job) !== null).length)
    assert.ok(withSalary.data.every((job) => topSalary(job) !== null))
    assert.equal((await getJobs({ hasSalary: false })).total, ALL)
  })

  test('source matches where the job was found', async () => {
    assert.equal((await getJobs({ source: 'seed' })).total, ALL)
    assert.equal((await getJobs({ source: 'GREENHOUSE' })).total, 0)
  })

  test('sort=salary_desc lists the highest salaries first and jobs without one last', async () => {
    const { data } = await getJobs({ sort: 'salary_desc' })
    const salaries = data.map(topSalary)
    const firstWithout = salaries.indexOf(null)
    assert.ok(firstWithout > 0)
    assert.ok(salaries.slice(firstWithout).every((salary) => salary === null), 'no salary after the first job without one')
    const known = salaries.slice(0, firstWithout) as number[]
    assert.deepEqual(known, known.toSorted((a, b) => b - a))

    const newest = await getJobs({ sort: 'newest' })
    const dates = newest.data.map((job) => job.createdAt)
    assert.deepEqual(dates, dates.toSorted().reverse())
  })

  test('sorting by salary pages without repeating or skipping jobs', async () => {
    const pages = await Promise.all([0, 7, 14, 21].map((offset) => getJobs({ sort: 'salary_desc', limit: 7, offset })))
    const ids = pages.flatMap((page) => page.data.map((job) => job.id))
    assert.equal(ids.length, ALL)
    assert.equal(new Set(ids).size, ALL)
  })

  test('filters combine', async () => {
    const body = await getJobs({ workplace: 'remote', minSalary: 90000, employmentType: 'full-time', sort: 'salary_desc' })
    const expected = SEED_JOBS.filter((job) => job.workplace === 'remote' && job.employmentType === 'full-time' && (topSalary(job) ?? 0) >= 90000)
    assert.ok(expected.length > 0)
    assert.equal(body.total, expected.length)
    assert.ok(body.data.every((job) => job.workplace === 'remote' && job.employmentType === 'full-time' && topSalary(job)! >= 90000))
  })

  const invalidQueries: Record<string, Record<string, string | number>> = {
    'an unknown posting window': { postedWithin: '1y' },
    'an unknown state': { state: 'ZZ' },
    'a country instead of a state': { state: 'Texas' },
    'an unknown employment type': { employmentType: 'gig' },
    'a negative minimum salary': { minSalary: -1 },
    'a non-numeric minimum salary': { minSalary: 'lots' },
    'hasSalary that is not a boolean': { hasSalary: 'maybe' },
    'a source with spaces': { source: 'remote ok' },
    'an unknown sort': { sort: 'oldest' }
  }

  for (const [name, query] of Object.entries(invalidQueries)) {
    test(`responds 400 for ${name}`, async () => {
      const res = await request(app).get('/jobs').query(query)
      assert.equal(res.status, 400)
      assert.ok(res.body.details[Object.keys(query)[0]], 'names the parameter')
    })
  }
})
