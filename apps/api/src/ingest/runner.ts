import type { InStatement } from '@libsql/client'
import type { z } from 'zod'
import { db } from '../db/database.js'
import { IngestionRunModel, type RunCounts } from '../models/ingestion-run.js'
import { JobModel } from '../models/job.js'
import { toIsoSeconds } from '../utils/dates.js'
import { fingerprint, SOURCE_PRIORITY } from './dedupe.js'
import { contentHash, refineWorkplace } from './normalize.js'
import { normalizedJobSchema, type NormalizedJob } from './schema.js'
import { SOURCES } from './sources/index.js'
import { tagTechnologies } from './technologies.js'
import type { Logger, Source } from './types.js'

export type { Logger }

const DAY_MS = 24 * 60 * 60 * 1000

// A job that the last 3 successful runs of its source did not see is closed...
export const CLOSE_AFTER_MISSED_RUNS = 3
// ...and so is a job posted more than 45 days ago, still listed or not, unless its source only
// lists open jobs (company boards keep long-running openings with their first posting date)
export const MAX_JOB_AGE_DAYS = 45
// Closed jobs are deleted 60 days after closing
export const DELETE_CLOSED_AFTER_DAYS = 60

const MAX_TECHNOLOGIES = 15

export interface IngestOptions {
  // Fetch, normalize and compare with the database, but write nothing (not even the run)
  dryRun?: boolean
  logger?: Logger
  // Writes are sent to the database in batches of this many statements
  batchSize?: number
  // The clock, injected by tests that check expiry
  now?: Date
}

export interface RunSummary extends RunCounts {
  source: string
  status: 'succeeded' | 'failed'
  // Already stored with the same content: only `last_seen_at` was touched
  unchanged: number
  error: string | null
  // `ingestion_runs.id`; null for a dry run
  runId: number | null
}

type Change = 'inserted' | 'updated' | 'unchanged'

function describeIssues (error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'job'}: ${issue.message}`).join('; ')
}

// The adapter's output, validated. Returns null (and logs why) for a job that has to be skipped.
function normalizeJob<RawJob> (source: Source<RawJob>, raw: RawJob, position: number, logger: Logger): NormalizedJob | null {
  let input: unknown
  try {
    input = source.normalize(raw)
  } catch (error) {
    logger.warn(`[${source.id}] skipped job #${position}: normalize threw: ${(error as Error).message}`)
    return null
  }

  const result = normalizedJobSchema.safeParse(input)
  if (!result.success) {
    const sourceId = (input as { sourceId?: unknown } | null)?.sourceId
    const label = typeof sourceId === 'string' || typeof sourceId === 'number' ? sourceId : `#${position}`
    logger.warn(`[${source.id}] skipped job ${label}: ${describeIssues(result.error)}`)
    return null
  }
  return enrichJob(result.data)
}

// What CodeHired adds to every job, whatever the source: technologies mentioned in the title and
// description (after the ones the source tagged), and a hybrid schedule the description states
export function enrichJob (job: NormalizedJob): NormalizedJob {
  const mentioned = tagTechnologies(`${job.title}\n${job.description}`)
  return {
    ...job,
    technologies: [...new Set([...job.technologies, ...mentioned])].slice(0, MAX_TECHNOLOGIES),
    workplace: refineWorkplace(job.workplace, job.description)
  }
}

// Fetches every job of one source and stores it: new jobs are inserted, jobs whose content changed
// are updated, and the rest only get `last_seen_at` touched. A failure while fetching ends the run
// as 'failed' but keeps what was already written.
export async function ingestSource<RawJob> (source: Source<RawJob>, options: IngestOptions = {}): Promise<RunSummary> {
  const { dryRun = false, logger = console, batchSize = 100, now = new Date() } = options
  const seenAt = toIsoSeconds(now)
  const runId = dryRun ? null : await IngestionRunModel.start(source.id, seenAt)

  const counts = { fetched: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0, closed: 0 }
  let pending: Array<{ statement: InStatement, change: Change }> = []
  let error: string | null = null

  // Counted only once written, so a failed run reports what actually reached the database
  async function flush () {
    if (pending.length === 0) return
    const writes = pending
    pending = []
    if (!dryRun) await db.batch(writes.map((write) => write.statement), 'write')
    for (const { change } of writes) counts[change]++
  }

  try {
    const storedHashes = await JobModel.getContentHashes(source.id)
    const seen = new Set<string>()

    for await (const raw of source.fetchJobs({ logger })) {
      counts.fetched++
      const job = normalizeJob(source, raw, counts.fetched, logger)
      if (!job) {
        counts.failed++
        continue
      }
      if (seen.has(job.sourceId)) {
        logger.warn(`[${source.id}] skipped job ${job.sourceId}: listed more than once`)
        counts.failed++
        continue
      }
      seen.add(job.sourceId)

      const hash = contentHash(job)
      const print = fingerprint(job)
      if (!storedHashes.has(job.sourceId)) {
        pending.push({ statement: JobModel.upsertStatement(source.id, job, hash, seenAt, print), change: 'inserted' })
      } else if (storedHashes.get(job.sourceId) !== hash) {
        pending.push({ statement: JobModel.upsertStatement(source.id, job, hash, seenAt, print), change: 'updated' })
      } else {
        pending.push({ statement: JobModel.touchStatement(source.id, job.sourceId, seenAt, print), change: 'unchanged' })
      }

      if (pending.length >= batchSize) await flush()
    }
    await flush()
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
    logger.error(`[${source.id}] run failed: ${error}`)
    // Keep the jobs fetched before the failure. A failed write already emptied `pending`.
    await flush().catch(() => {})
  }

  const status = error ? 'failed' : 'succeeded'
  if (runId !== null) {
    // Only a complete run says which jobs are gone
    if (status === 'succeeded') {
      counts.closed = await JobModel.closeStale(source.id, {
        runId,
        runs: CLOSE_AFTER_MISSED_RUNS,
        maxPostedAt: source.devOnly || source.listsOnlyOpenJobs
          ? null
          : toIsoSeconds(new Date(now.getTime() - MAX_JOB_AGE_DAYS * DAY_MS)),
        now: seenAt
      })
    }
    await IngestionRunModel.finish(runId, {
      status,
      finishedAt: toIsoSeconds(),
      fetched: counts.fetched,
      inserted: counts.inserted,
      updated: counts.updated,
      failed: counts.failed,
      closed: counts.closed,
      error
    })
  }

  return { source: source.id, status, error, runId, ...counts }
}

// One source after the other: a source that fails does not stop the next ones. Then the
// housekeeping that spans sources: old closed jobs are deleted and duplicates are recomputed.
export async function runIngestion (sources: readonly Source[], options: IngestOptions = {}) {
  const { dryRun = false, logger = console, now = new Date() } = options
  const summaries: RunSummary[] = []
  for (const source of sources) {
    summaries.push(await ingestSource(source, { ...options, now }))
  }
  if (dryRun) return summaries

  const deleted = await JobModel.deleteClosed(toIsoSeconds(new Date(now.getTime() - DELETE_CLOSED_AFTER_DAYS * DAY_MS)))
  if (deleted > 0) logger.info(`Deleted ${deleted} jobs closed more than ${DELETE_CLOSED_AFTER_DAYS} days ago`)

  // Every known source, so jobs of sources that did not run this time are ranked too
  const priorities = new Map<string, number>()
  for (const source of [...SOURCES, ...sources]) {
    priorities.set(source.id, source.priority ?? SOURCE_PRIORITY.unknown)
  }
  await JobModel.rebuildDuplicates(priorities, SOURCE_PRIORITY.unknown)
  return summaries
}
