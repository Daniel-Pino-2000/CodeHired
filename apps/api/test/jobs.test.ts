import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { CONFIG } from '../src/config.js'
import { SEED_JOBS } from '../src/db/seed-data.js'
import type { Job, Paginated } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

async function getJobs (query: Record<string, string | number> = {}) {
  const res = await request(app).get('/jobs').query(query)
  return { res, body: res.body as Paginated<Job> }
}

describe('GET /jobs', () => {
  test('returns the first page with the default page size', async () => {
    const { res, body } = await getJobs()

    assert.equal(res.status, 200)
    assert.equal(body.total, SEED_JOBS.length)
    assert.equal(body.limit, CONFIG.DEFAULT_PAGE_SIZE)
    assert.equal(body.offset, 0)
    assert.equal(body.data.length, Math.min(CONFIG.DEFAULT_PAGE_SIZE, SEED_JOBS.length))
  })

  test('sorts jobs from newest to oldest', async () => {
    const { body } = await getJobs({ limit: CONFIG.MAX_PAGE_SIZE })
    const dates = body.data.map((job) => job.createdAt)

    assert.deepEqual(dates, dates.toSorted().reverse())
  })

  test('paginates with limit and offset without repeating jobs', async () => {
    const { body: first } = await getJobs({ limit: 5, offset: 0 })
    const { body: second } = await getJobs({ limit: 5, offset: 5 })

    assert.equal(first.data.length, 5)
    assert.equal(second.offset, 5)
    const firstIds = new Set(first.data.map((job) => job.id))
    assert.ok(second.data.every((job) => !firstIds.has(job.id)))
  })

  test('filters by text in the title, company or description', async () => {
    const { company } = SEED_JOBS[0]
    const { body } = await getJobs({ text: company.toUpperCase() })

    assert.ok(body.total >= 1)
    assert.ok(body.data.some((job) => job.company === company))
  })

  test('filters by technology, ignoring case', async () => {
    const expected = SEED_JOBS.filter((job) => job.technologies.includes('react')).length
    const { body } = await getJobs({ technology: 'React', limit: CONFIG.MAX_PAGE_SIZE })

    assert.equal(body.total, expected)
    assert.ok(body.data.every((job) => job.technologies.includes('react')))
  })

  test('filters by level', async () => {
    const expected = SEED_JOBS.filter((job) => job.level === 'junior').length
    const { body } = await getJobs({ level: 'junior', limit: CONFIG.MAX_PAGE_SIZE })

    assert.equal(body.total, expected)
    assert.ok(body.data.every((job) => job.level === 'junior'))
  })

  test('filters by workplace', async () => {
    const expected = SEED_JOBS.filter((job) => job.workplace === 'remote').length
    const { body } = await getJobs({ workplace: 'remote', limit: CONFIG.MAX_PAGE_SIZE })

    assert.equal(body.total, expected)
    assert.ok(body.data.every((job) => job.workplace === 'remote'))
  })

  test('combines filters', async () => {
    const expected = SEED_JOBS.filter((job) => job.level === 'senior' && job.workplace === 'remote').length
    const { body } = await getJobs({ level: 'senior', workplace: 'remote' })

    assert.equal(body.total, expected)
  })

  test('treats empty filters as not set', async () => {
    const { body } = await getJobs({ text: '', level: '', workplace: '', technology: '' })

    assert.equal(body.total, SEED_JOBS.length)
  })

  test('returns an empty page when nothing matches', async () => {
    const { res, body } = await getJobs({ text: 'no job has this text zzz' })

    assert.equal(res.status, 200)
    assert.equal(body.total, 0)
    assert.deepEqual(body.data, [])
  })

  const invalidQueries: Record<string, Record<string, string | number>> = {
    'an unknown level': { level: 'wizard' },
    'an unknown workplace': { workplace: 'moon' },
    'a limit of 0': { limit: 0 },
    'a limit above the maximum': { limit: CONFIG.MAX_PAGE_SIZE + 1 },
    'a negative offset': { offset: -1 },
    'a non-numeric limit': { limit: 'ten' }
  }

  for (const [name, query] of Object.entries(invalidQueries)) {
    test(`responds 400 for ${name}`, async () => {
      const res = await request(app).get('/jobs').query(query)

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Invalid query parameters')
      assert.ok(res.body.details)
    })
  }
})

describe('GET /jobs/:id', () => {
  test('returns the job', async () => {
    const { body } = await getJobs({ limit: 1 })
    const [job] = body.data

    const res = await request(app).get(`/jobs/${job.id}`)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, job)
  })

  test('responds 404 for an unknown id', async () => {
    const res = await request(app).get('/jobs/does-not-exist')

    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Job not found')
  })
})
