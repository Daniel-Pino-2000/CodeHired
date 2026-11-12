import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { runMigrations } from '../src/db/migrations.js'
import { formatMarkdownReport, FREE_STORAGE_BYTES, type DatabaseStats } from '../src/ingest/report.js'
import type { RunSummary } from '../src/ingest/runner.js'
import { splitDueSources } from '../src/ingest/schedule.js'
import { getSource } from '../src/ingest/sources/index.js'
import type { Source } from '../src/ingest/types.js'
import { IngestionRunModel } from '../src/models/ingestion-run.js'

await runMigrations()

function fakeSource (id: string, minHoursBetweenRuns?: number): Source {
  return {
    id,
    name: id,
    attribution: { label: id, url: 'https://example.com' },
    minHoursBetweenRuns,
    async * fetchJobs () {},
    normalize: () => { throw new Error('not used') }
  }
}

const summary = (overrides: Partial<RunSummary>): RunSummary => ({
  source: 'greenhouse',
  status: 'succeeded',
  error: null,
  runId: 1,
  fetched: 120,
  inserted: 10,
  updated: 3,
  unchanged: 105,
  failed: 2,
  closed: 1,
  ...overrides
})

const stats: DatabaseStats = { total: 900, listed: 800, duplicates: 60, closed: 40, bytes: 12 * 1024 ** 2 }

describe('splitDueSources', () => {
  const now = new Date('2026-11-12T12:00:00Z')

  test('runs sources without a limit, and limited ones that never ran', () => {
    const { due, notDue } = splitDueSources([fakeSource('free'), fakeSource('daily', 20)], new Map([['free', '2026-11-12T11:59:00Z']]), now)
    assert.deepEqual(due.map((source) => source.id), ['free', 'daily'])
    assert.deepEqual(notDue, [])
  })

  test('skips a source until its interval has passed since its last run started', () => {
    const sources = [fakeSource('daily', 20), fakeSource('hourly', 1)]
    const recent = new Map([['daily', '2026-11-12T00:00:00Z'], ['hourly', '2026-11-12T11:30:00Z']])
    const { due, notDue } = splitDueSources(sources, recent, now)
    assert.deepEqual(due, [])
    assert.deepEqual(notDue.map(({ source, dueAt }) => [source.id, dueAt]), [
      ['daily', '2026-11-12T20:00:00Z'],
      ['hourly', '2026-11-12T12:30:00Z']
    ])

    const later = splitDueSources(sources, new Map([['daily', '2026-11-11T16:00:00Z'], ['hourly', '2026-11-12T11:00:00Z']]), now)
    assert.deepEqual(later.due.map((source) => source.id), ['daily', 'hourly'], 'exactly the interval is enough')
  })

  test('the 6-hourly schedule runs company boards once a day and Jobicy every time', () => {
    for (const id of ['greenhouse', 'lever', 'ashby']) {
      assert.equal(getSource(id)?.minHoursBetweenRuns, 20, id)
    }
    assert.equal(getSource('jobicy')?.minHoursBetweenRuns, 1)
    assert.equal(getSource('remoteok')?.minHoursBetweenRuns, undefined)

    // Ticks every 6 hours, each one started by GitHub up to 30 minutes late
    const lastStarted = new Map<string, string>()
    let boardRuns = 0
    for (let tick = 0; tick < 4 * 7; tick++) {
      const at = new Date(Date.parse('2026-11-01T00:00:00Z') + tick * 6 * 3600_000 + (tick % 3) * 15 * 60_000)
      const { due } = splitDueSources([getSource('greenhouse')!, getSource('jobicy')!], lastStarted, at)
      if (due.some((source) => source.id === 'greenhouse')) boardRuns++
      assert.ok(due.some((source) => source.id === 'jobicy'), 'jobicy runs every tick')
      for (const source of due) lastStarted.set(source.id, at.toISOString().slice(0, 19) + 'Z')
    }
    assert.equal(boardRuns, 7, 'one company board run a day for a week')
  })
})

describe('IngestionRunModel.lastStarted', () => {
  test('is the start of the latest run of each source, failed ones included', async () => {
    const first = await IngestionRunModel.start('schedule-a', '2026-11-10T00:00:00Z')
    await IngestionRunModel.finish(first, { status: 'succeeded', finishedAt: '2026-11-10T00:05:00Z', fetched: 0, inserted: 0, updated: 0, failed: 0, closed: 0, error: null })
    const second = await IngestionRunModel.start('schedule-a', '2026-11-11T00:00:00Z')
    await IngestionRunModel.finish(second, { status: 'failed', finishedAt: '2026-11-11T00:01:00Z', fetched: 0, inserted: 0, updated: 0, failed: 0, closed: 0, error: 'boom' })
    await IngestionRunModel.start('schedule-b', '2026-11-09T00:00:00Z')

    const lastStarted = await IngestionRunModel.lastStarted()
    assert.equal(lastStarted.get('schedule-a'), '2026-11-11T00:00:00Z')
    assert.equal(lastStarted.get('schedule-b'), '2026-11-09T00:00:00Z')
  })
})

describe('formatMarkdownReport', () => {
  test('a table row per source, the sources not due, and the database totals', () => {
    const markdown = formatMarkdownReport({
      summaries: [summary({}), summary({ source: 'jobicy', status: 'failed', error: 'HTTP 429 | slow\ndown', fetched: 0 })],
      notDue: [{ source: fakeSource('lever', 20), dueAt: '2026-11-13T02:00:00Z' }],
      database: stats,
      dryRun: false,
      durationMs: 4200
    })

    assert.match(markdown, /^## Ingestion\n/)
    assert.match(markdown, /\| `greenhouse` \| ✅ succeeded \| 120 \| 10 \| 3 \| 105 \| 2 \| 1 \|/)
    assert.match(markdown, /\| `jobicy` \| ❌ failed: HTTP 429 \\\| slow down \| 0 \|/, 'pipes and line breaks cannot break the table')
    assert.match(markdown, /- `lever`: every 20h, next after 2026-11-13T02:00:00Z/)
    assert.match(markdown, /\*\*Database:\*\* 800 jobs listed, 60 duplicates, 40 closed \(900 rows\), 12\.0 MB of the 5120\.0 MB free tier/)
    assert.doesNotMatch(markdown, /WARNING/)
    assert.match(markdown, /Done in 4\.2s\./)
  })

  test('says when nothing was due, marks dry runs and warns near the storage limit', () => {
    const quiet = formatMarkdownReport({ summaries: [], notDue: [], database: null, dryRun: true, durationMs: 10 })
    assert.match(quiet, /## Ingestion \(dry run, nothing written\)/)
    assert.match(quiet, /No source was due, nothing fetched\./)
    assert.doesNotMatch(quiet, /Database/)

    const full = formatMarkdownReport({ summaries: [summary({})], notDue: [], database: { ...stats, bytes: FREE_STORAGE_BYTES * 0.9 }, dryRun: false, durationMs: 10 })
    assert.match(full, /> \[!WARNING\]\n> The database is above 80% of the free storage\./)
  })
})
