import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { fingerprint, fingerprintCompany, fingerprintTitle, SOURCE_PRIORITY } from '../src/ingest/dedupe.js'
import { runIngestion, type Logger } from '../src/ingest/runner.js'
import { normalizeFixtureJob, type FixtureJob } from '../src/ingest/sources/fixture.js'
import type { Source } from '../src/ingest/types.js'
import { db } from '../src/db/database.js'
import { JobModel } from '../src/models/job.js'
import type { Job, Paginated } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }

function posting (overrides: Partial<FixtureJob> & Pick<FixtureJob, 'id' | 'company'>): FixtureJob {
  return {
    title: 'Senior Backend Engineer',
    url: `https://jobs.example.com/${overrides.id}`,
    location: { city: 'Austin', state: 'TX', country: 'US' },
    description_html: '<p>Build the payments platform in Go and PostgreSQL.</p>',
    ...overrides
  }
}

function source (id: string, priority: number, jobs: FixtureJob[]): Source<FixtureJob> {
  return {
    id,
    name: id,
    attribution: { label: id, url: 'https://example.com' },
    priority,
    async * fetchJobs () { yield * jobs },
    normalize: normalizeFixtureJob
  }
}

async function listed (text: string) {
  const res = await request(app).get('/jobs').query({ text, limit: 50 })
  return (res.body as Paginated<Job>).data
}

async function rowBySource (sourceName: string, sourceId: string) {
  const { rows: [row] } = await db.execute({ sql: 'SELECT * FROM jobs WHERE source = ? AND source_id = ?', args: [sourceName, sourceId] })
  return row
}

describe('fingerprint', () => {
  test('ignores legal suffixes, punctuation and case in the company', () => {
    assert.equal(fingerprintCompany('Acme, Inc.'), 'acme')
    assert.equal(fingerprintCompany('ACME Corp'), 'acme')
    assert.equal(fingerprintCompany('Procter & Gamble Co.'), 'procter and gamble')
  })

  test('expands abbreviations and drops workplace words in the title', () => {
    assert.equal(fingerprintTitle('Sr. Software Eng. II (Remote)'), 'senior software engineer 2')
    assert.equal(fingerprintTitle('Senior Software Engineer II'), 'senior software engineer 2')
    assert.equal(fingerprintTitle('Jr Dev - US'), 'junior developer')
  })

  test('treats spellings of the same city as one place, and remote jobs without a city as "remote"', () => {
    const job = { company: 'Acme', title: 'Engineer', state: 'NY', remote: false, location: 'New York, NY' }
    assert.equal(fingerprint({ ...job, city: 'NYC' }), fingerprint({ ...job, city: 'New York City' }))
    assert.equal(fingerprint({ ...job, city: 'New York' }), 'acme|engineer|new york ny')
    assert.equal(fingerprint({ ...job, city: null, state: null, remote: true, location: 'Remote (US)' }), 'acme|engineer|remote')
    assert.notEqual(fingerprint({ ...job, city: 'Austin', state: 'TX' }), fingerprint({ ...job, city: 'Dallas', state: 'TX' }))
  })
})

describe('the same job from two sources', () => {
  test('appears once in GET /jobs, from the source with the higher priority, and job_sources lists both', async () => {
    const aggregator = source('dedupe-aggregator', SOURCE_PRIORITY.adzuna, [
      posting({ id: 'agg-1', company: 'Dedupe Widgets Inc.', title: 'Sr. Backend Engineer' })
    ])
    const board = source('dedupe-board', SOURCE_PRIORITY.companyAts, [
      posting({ id: 'board-1', company: 'Dedupe Widgets', title: 'Senior Backend Engineer' })
    ])

    // The aggregator runs first, so its copy is older: priority still wins
    await runIngestion([aggregator, board], { logger: silent })

    const jobs = await listed('Dedupe Widgets')
    const canonical = await rowBySource('dedupe-board', 'board-1')
    const copy = await rowBySource('dedupe-aggregator', 'agg-1')
    assert.deepEqual(jobs.map((job) => job.id), [canonical.id])
    assert.equal(copy.duplicate_of, canonical.id)
    assert.equal(canonical.duplicate_of, null)
    assert.equal(canonical.fingerprint, copy.fingerprint)

    const sources = await JobModel.getSources(String(canonical.id))
    assert.deepEqual(sources.map((entry) => [entry.source, entry.sourceUrl]), [
      ['dedupe-board', 'https://jobs.example.com/board-1'],
      ['dedupe-aggregator', 'https://jobs.example.com/agg-1']
    ])
  })

  test('the copy is listed again when the canonical job closes', async () => {
    const aggregator = source('handover-aggregator', SOURCE_PRIORITY.jsearch, [posting({ id: 'agg-2', company: 'Handover Labs' })])
    const board = source('handover-board', SOURCE_PRIORITY.companyAts, [posting({ id: 'board-2', company: 'Handover Labs' })])
    await runIngestion([aggregator, board], { logger: silent })
    assert.equal((await listed('Handover Labs')).length, 1)

    await db.execute("UPDATE jobs SET closed_at = '2026-10-30T00:00:00Z' WHERE source = 'handover-board'")
    await runIngestion([], { logger: silent })

    const copy = await rowBySource('handover-aggregator', 'agg-2')
    assert.deepEqual((await listed('Handover Labs')).map((job) => job.id), [copy.id])
    assert.equal(copy.duplicate_of, null)
  })

  test('two postings with the same title on one board both stay listed', async () => {
    await runIngestion([source('twin-board', SOURCE_PRIORITY.companyAts, [
      posting({ id: 'twin-1', company: 'Twin Openings' }),
      posting({ id: 'twin-2', company: 'Twin Openings' })
    ])], { logger: silent })

    assert.equal((await listed('Twin Openings')).length, 2)
  })

  test('a dry run does not touch duplicates', async () => {
    const before = await JobModel.stats()
    await runIngestion([source('dry-copy', SOURCE_PRIORITY.adzuna, [posting({ id: 'dry-1', company: 'Twin Openings' })])], { logger: silent, dryRun: true })
    assert.deepEqual(await JobModel.stats(), before)
  })
})

test('stats counts listed, duplicate and closed jobs, and the database size', async () => {
  const stats = await JobModel.stats()
  assert.ok(stats.listed > 0)
  assert.ok(stats.duplicates >= 1)
  assert.ok(stats.closed >= 1)
  assert.equal(stats.total, stats.listed + stats.duplicates + stats.closed)
  assert.ok(stats.bytes === null || stats.bytes > 0)
})
