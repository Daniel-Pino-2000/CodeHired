import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import { ingestSource, runIngestion, type Logger } from '../src/ingest/runner.js'
import { normalizeFixtureJob, type FixtureJob } from '../src/ingest/sources/fixture.js'
import type { Source } from '../src/ingest/types.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import { IngestionRunModel } from '../src/models/ingestion-run.js'

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} }
const DAY_MS = 24 * 60 * 60 * 1000
const START = new Date('2026-10-01T12:00:00Z')
const day = (n: number) => new Date(START.getTime() + n * DAY_MS)

function posting (id: string, publishedAt = START.toISOString()): FixtureJob {
  return {
    id,
    title: `Backend Engineer ${id}`,
    company: 'Expiry Co',
    url: `https://jobs.example.com/${id}`,
    location: { city: 'Denver', state: 'CO', country: 'US' },
    description_html: '<p>A job that comes and goes with the runs.</p>',
    published_at: publishedAt
  }
}

// A source whose jobs are whatever `current` holds at the time of the run
function source (id: string, current: { jobs: FixtureJob[] }, flags: Pick<Source, 'devOnly' | 'listsOnlyOpenJobs'> = {}): Source<FixtureJob> {
  return {
    id,
    name: id,
    attribution: { label: id, url: 'https://example.com' },
    ...flags,
    async * fetchJobs () { yield * current.jobs },
    normalize: normalizeFixtureJob
  }
}

async function closedAt (sourceName: string) {
  const { rows } = await db.execute({ sql: 'SELECT source_id, closed_at FROM jobs WHERE source = ? ORDER BY source_id', args: [sourceName] })
  return Object.fromEntries(rows.map((row) => [String(row.source_id), row.closed_at]))
}

before(async () => { await runMigrations() })

describe('expiry', () => {
  test('closes a job that the last 3 successful runs did not see, and reopens it when it comes back', async () => {
    const current = { jobs: [posting('1'), posting('2')] }
    const runs = source('expiry-runs', current)

    await ingestSource(runs, { logger: silent, now: day(0) })
    current.jobs = [posting('1')]
    const second = await ingestSource(runs, { logger: silent, now: day(1) })
    const third = await ingestSource(runs, { logger: silent, now: day(2) })
    assert.deepEqual([second.closed, third.closed], [0, 0], 'job 2 was still seen by one of the last 3 runs')

    const fourth = await ingestSource(runs, { logger: silent, now: day(3) })
    assert.equal(fourth.closed, 1)
    assert.deepEqual(await closedAt('expiry-runs'), { 1: null, 2: '2026-10-04T12:00:00Z' })
    const [run] = await IngestionRunModel.getAll('expiry-runs')
    assert.equal(run.closed, 1)

    current.jobs = [posting('1'), posting('2')]
    await ingestSource(runs, { logger: silent, now: day(4) })
    assert.deepEqual(await closedAt('expiry-runs'), { 1: null, 2: null })
  })

  test('a failed run neither closes jobs nor counts as one of the 3 runs', async () => {
    const current = { jobs: [posting('1'), posting('2')] }
    const flaky = source('expiry-failed', current)
    await ingestSource(flaky, { logger: silent, now: day(0) })

    const broken: Source<FixtureJob> = {
      ...flaky,
      async * fetchJobs () { throw new Error('down') }
    }
    for (const n of [1, 2, 3]) await ingestSource(broken, { logger: silent, now: day(n) })
    current.jobs = [posting('1')]
    const summary = await ingestSource(flaky, { logger: silent, now: day(4) })

    assert.equal(summary.closed, 0)
    assert.deepEqual(await closedAt('expiry-failed'), { 1: null, 2: null })
  })

  test('closes jobs posted more than 45 days ago, even when they are still listed', async () => {
    const old = new Date(day(10).getTime() - 46 * DAY_MS).toISOString()
    const recent = new Date(day(10).getTime() - 44 * DAY_MS).toISOString()
    const summary = await ingestSource(source('expiry-age', { jobs: [posting('old', old), posting('recent', recent)] }), { logger: silent, now: day(10) })

    assert.equal(summary.closed, 1)
    assert.deepEqual(await closedAt('expiry-age'), { old: '2026-10-11T12:00:00Z', recent: null })
  })

  test('jobs from company boards and fictional jobs are not closed for their age', async () => {
    const old = new Date(day(0).getTime() - 400 * DAY_MS).toISOString()
    const board = await ingestSource(source('expiry-board', { jobs: [posting('old', old)] }, { listsOnlyOpenJobs: true }), { logger: silent, now: day(0) })
    const sample = await ingestSource(source('expiry-sample', { jobs: [posting('old', old)] }, { devOnly: true }), { logger: silent, now: day(0) })

    assert.deepEqual([board.closed, sample.closed], [0, 0])
  })

  test('deletes jobs closed more than 60 days ago, but never the seed jobs', async () => {
    await ingestSource(source('expiry-delete', { jobs: [posting('gone'), posting('recently-gone')] }), { logger: silent, now: day(0) })
    await db.execute("UPDATE jobs SET closed_at = '2026-08-01T00:00:00Z' WHERE source = 'expiry-delete' AND source_id = 'gone'")
    await db.execute("UPDATE jobs SET closed_at = '2026-09-15T00:00:00Z' WHERE source = 'expiry-delete' AND source_id = 'recently-gone'")
    await db.execute(`
      INSERT INTO jobs (id, source_id, title, company, location, workplace, level, description_text, closed_at)
      VALUES ('seed-closed', 'seed-closed', 'Engineer', 'Seed Co', 'Remote', 'remote', 'mid', 'A closed sample job', '2026-01-01T00:00:00Z')
    `)

    // 2026-10-02 minus 60 days is 2026-08-03
    await runIngestion([], { logger: silent, now: new Date('2026-10-02T00:00:00Z') })

    assert.deepEqual(await closedAt('expiry-delete'), { 'recently-gone': '2026-09-15T00:00:00Z' })
    const { rows } = await db.execute("SELECT id FROM jobs WHERE id = 'seed-closed'")
    assert.equal(rows.length, 1)
  })
})
