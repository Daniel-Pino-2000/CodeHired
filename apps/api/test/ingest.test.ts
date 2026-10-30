import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, describe, test } from 'node:test'
import request from 'supertest'
import { parseIngestArgs } from '../src/ingest/args.js'
import { ingestSource, runIngestion, type Logger } from '../src/ingest/runner.js'
import { createFixtureSource, FIXTURES_DIR, normalizeFixtureJob, type FixtureJob } from '../src/ingest/sources/fixture.js'
import { resolveSources } from '../src/ingest/sources/index.js'
import type { Source } from '../src/ingest/types.js'
import { db } from '../src/db/database.js'
import { IngestionRunModel } from '../src/models/ingestion-run.js'
import type { Job, Paginated } from '../src/types.js'
import { createTestApp } from './helpers.js'

// Migrated and seeded: ingested jobs live next to the seed jobs, like in development
const app = await createTestApp()

const JOBS_FILE = new URL('jobs.json', FIXTURES_DIR)
const INVALID_JOBS_FILE = new URL('invalid-jobs.json', FIXTURES_DIR)
const { jobs: FIXTURE_JOBS } = JSON.parse(await readFile(JOBS_FILE, 'utf8')) as { jobs: FixtureJob[] }

const tempDirs: string[] = []
after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function fixtureFile (jobs: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), 'codehired-ingest-'))
  tempDirs.push(dir)
  const file = join(dir, 'jobs.json')
  await writeFile(file, JSON.stringify({ jobs }))
  return pathToFileURL(file)
}

// Collects what the runner logs instead of printing it
function recordingLogger () {
  const warnings: string[] = []
  const errors: string[] = []
  const logger: Logger = {
    info: () => {},
    warn: (message: string) => { warnings.push(message) },
    error: (message: string) => { errors.push(message) }
  }
  return { logger, warnings, errors }
}

async function storedJobs (source: string) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM jobs WHERE source = ? ORDER BY source_id', args: [source] })
  return rows
}

// Each test uses its own source id, so they do not see each other's jobs
const silent = recordingLogger().logger

describe('ingestSource', () => {
  test('running the fixture source twice inserts the jobs once and records two runs', async () => {
    const source = createFixtureSource(JOBS_FILE, 'fixture-twice')

    const first = await ingestSource(source, { logger: silent })
    const second = await ingestSource(source, { logger: silent })

    assert.equal(first.status, 'succeeded')
    assert.equal(first.inserted, FIXTURE_JOBS.length)
    assert.deepEqual(
      { inserted: second.inserted, updated: second.updated, unchanged: second.unchanged, failed: second.failed },
      { inserted: 0, updated: 0, unchanged: FIXTURE_JOBS.length, failed: 0 }
    )
    assert.equal((await storedJobs('fixture-twice')).length, FIXTURE_JOBS.length)

    const runs = await IngestionRunModel.getAll('fixture-twice')
    assert.equal(runs.length, 2)
    assert.ok(runs.every((run) => run.status === 'succeeded' && run.finishedAt !== null && run.error === null))
    assert.deepEqual(runs.map((run) => run.inserted), [0, FIXTURE_JOBS.length])
    assert.deepEqual(runs.map((run) => run.fetched), [FIXTURE_JOBS.length, FIXTURE_JOBS.length])
  })

  test('stores every column of a normalized job', async () => {
    await ingestSource(createFixtureSource(JOBS_FILE, 'fixture-columns'), { logger: silent })

    const [job] = await storedJobs('fixture-columns')
    assert.equal(job.source_id, '4001')
    assert.equal(job.source_url, 'https://jobs.example.com/copperline/4001')
    assert.equal(job.city, 'Austin')
    assert.equal(job.state, 'TX')
    assert.equal(job.country, 'US')
    assert.equal(job.remote, 0)
    assert.equal(job.workplace, 'hybrid')
    assert.equal(job.posted_at, '2026-10-20T14:30:00Z')
    assert.equal(job.created_at, job.posted_at, 'created_at is the posting date when there is one')
    assert.match(String(job.description_html), /^<p>/)
    assert.match(String(job.description_text), /^Copperline builds/)
    assert.match(String(job.content_hash), /^[\da-f]{64}$/)
    assert.equal(job.closed_at, null)
  })

  test('updates a job only when its content changed, and always touches last_seen_at', async () => {
    const id = 'fixture-changes'
    await ingestSource(createFixtureSource(JOBS_FILE, id), { logger: silent })
    // Pretend the first run happened a while ago, and that one job was closed since
    await db.execute({ sql: "UPDATE jobs SET last_seen_at = '2020-01-01T00:00:00Z' WHERE source = ?", args: [id] })
    await db.execute({ sql: "UPDATE jobs SET closed_at = '2020-01-02T00:00:00Z' WHERE source = ? AND source_id = '4005'", args: [id] })
    const before = await storedJobs(id)

    const changed = FIXTURE_JOBS.map((job) => (job.id === '4002' ? { ...job, title: 'Senior Backend Engineer, Payments' } : job))
    const summary = await ingestSource(createFixtureSource(await fixtureFile(changed), id), { logger: silent })

    assert.equal(summary.updated, 1)
    assert.equal(summary.unchanged, FIXTURE_JOBS.length - 1)
    const after = await storedJobs(id)
    const job4002 = after.find((job) => job.source_id === '4002')!
    assert.equal(job4002.title, 'Senior Backend Engineer, Payments')
    assert.equal(job4002.level, 'senior')
    assert.notEqual(job4002.content_hash, before.find((job) => job.source_id === '4002')!.content_hash)
    assert.equal(job4002.id, before.find((job) => job.source_id === '4002')!.id, 'the id does not change on update')
    assert.ok(after.every((job) => String(job.last_seen_at) > '2020-01-01T00:00:00Z'))
    assert.ok(after.every((job) => job.closed_at === null), 'a job seen again is open again')
  })

  test('skips and logs invalid jobs without failing the run', async () => {
    const { logger, warnings } = recordingLogger()

    const summary = await ingestSource(createFixtureSource(INVALID_JOBS_FILE, 'fixture-invalid'), { logger })

    assert.equal(summary.status, 'succeeded')
    assert.equal(summary.fetched, 8)
    assert.equal(summary.inserted, 2)
    assert.equal(summary.failed, 6)
    assert.deepEqual((await storedJobs('fixture-invalid')).map((job) => job.source_id), ['5001', '5006'])
    assert.equal(warnings.length, 6)
    assert.ok(warnings.some((warning) => /5002: sourceUrl/.test(warning)))
    assert.ok(warnings.some((warning) => /5003: sourceUrl/.test(warning)))
    assert.ok(warnings.some((warning) => /5004: salaryMin/.test(warning)))
    assert.ok(warnings.some((warning) => /5005: description/.test(warning)))
    assert.ok(warnings.some((warning) => /#6: normalize threw/.test(warning)))
    assert.ok(warnings.some((warning) => /5001: listed more than once/.test(warning)))

    const [run] = await IngestionRunModel.getAll('fixture-invalid')
    assert.equal(run.failed, 6)
  })

  test('a dry run writes neither jobs nor runs', async () => {
    const summary = await ingestSource(createFixtureSource(JOBS_FILE, 'fixture-dry'), { dryRun: true, logger: silent })

    assert.equal(summary.inserted, FIXTURE_JOBS.length)
    assert.equal(summary.runId, null)
    assert.equal((await storedJobs('fixture-dry')).length, 0)
    assert.equal((await IngestionRunModel.getAll('fixture-dry')).length, 0)
  })

  test('a source that fails while fetching ends as failed and keeps the jobs fetched so far', async () => {
    const { logger, errors } = recordingLogger()
    const broken: Source<FixtureJob> = {
      id: 'fixture-broken',
      name: 'Broken',
      attribution: { label: 'Broken', url: 'https://example.com' },
      async * fetchJobs () {
        yield FIXTURE_JOBS[0]
        throw new Error('board responded 503')
      },
      normalize: normalizeFixtureJob
    }

    const summary = await ingestSource(broken, { logger })

    assert.equal(summary.status, 'failed')
    assert.equal(summary.inserted, 1)
    assert.equal((await storedJobs('fixture-broken')).length, 1)
    assert.match(errors[0], /board responded 503/)
    const [run] = await IngestionRunModel.getAll('fixture-broken')
    assert.equal(run.status, 'failed')
    assert.equal(run.error, 'board responded 503')
  })

  test('writes in batches', async () => {
    const summary = await ingestSource(createFixtureSource(JOBS_FILE, 'fixture-batches'), { logger: silent, batchSize: 2 })

    assert.equal(summary.inserted, FIXTURE_JOBS.length)
    assert.equal((await storedJobs('fixture-batches')).length, FIXTURE_JOBS.length)
  })
})

describe('runIngestion', () => {
  test('runs every source even when one of them fails', async () => {
    const failing: Source = {
      id: 'fixture-fails',
      name: 'Fails',
      attribution: { label: 'Fails', url: 'https://example.com' },
      async * fetchJobs () { throw new Error('down') },
      normalize: () => { throw new Error('unreachable') }
    }

    const summaries = await runIngestion([failing, createFixtureSource(JOBS_FILE, 'fixture-after')], { logger: silent })

    assert.deepEqual(summaries.map((summary) => summary.status), ['failed', 'succeeded'])
  })
})

describe('GET /jobs with ingested jobs', () => {
  test('lists ingested jobs next to the seed jobs, and hides closed ones', async () => {
    await ingestSource(createFixtureSource(JOBS_FILE, 'fixture-api'), { logger: silent })
    const [closed] = await storedJobs('fixture-api')
    await db.execute({ sql: "UPDATE jobs SET closed_at = '2026-10-29T00:00:00Z' WHERE id = ?", args: [closed.id] })

    const res = await request(app).get('/jobs').query({ text: 'Tallgrass', limit: 50 })
    const body = res.body as Paginated<Job>

    assert.equal(res.status, 200)
    assert.ok(body.data.length >= 1)
    assert.ok(body.data.every((job) => job.company === 'Tallgrass Pay'))
    assert.match(body.data[0].description, /idempotent payment APIs/)

    const listed = await request(app).get('/jobs').query({ text: String(closed.title), limit: 50 })
    assert.ok((listed.body as Paginated<Job>).data.every((job) => job.id !== closed.id), 'closed jobs are not listed')
    const detail = await request(app).get(`/jobs/${String(closed.id)}`)
    assert.equal(detail.status, 200, 'but they can still be opened by id')
  })
})

describe('CLI arguments', () => {
  test('parses --source (repeated or comma-separated) and --dry-run', () => {
    assert.deepEqual(parseIngestArgs(['--source=a,b', '--source', 'c', '--dry-run']), {
      sourceIds: ['a', 'b', 'c'],
      dryRun: true,
      help: false
    })
    assert.deepEqual(parseIngestArgs(['--', '--source=fixture']).sourceIds, ['fixture'])
    assert.deepEqual(parseIngestArgs([]), { sourceIds: [], dryRun: false, help: false })
  })

  test('rejects unknown flags', () => {
    assert.throws(() => parseIngestArgs(['--sorce=fixture']), /Unknown option/)
  })

  test('selects sources by id and refuses fictional ones against a hosted database', () => {
    assert.deepEqual(resolveSources(['fixture'], { isLocalDatabase: true }).map((source) => source.id), ['fixture'])
    assert.ok(resolveSources([], { isLocalDatabase: true }).every((source) => !source.devOnly))
    assert.throws(() => resolveSources(['nope'], { isLocalDatabase: true }), /Unknown source "nope"/)
    assert.throws(() => resolveSources(['fixture'], { isLocalDatabase: false }), /only runs against a local database/)
  })
})
