import type { InStatement } from '@libsql/client'
import type { z } from 'zod'
import { db } from '../db/database.js'
import { IngestionRunModel, type RunCounts } from '../models/ingestion-run.js'
import { JobModel } from '../models/job.js'
import { toIsoSeconds } from '../utils/dates.js'
import { contentHash } from './normalize.js'
import { normalizedJobSchema, type NormalizedJob } from './schema.js'
import type { Logger, Source } from './types.js'

export type { Logger }

export interface IngestOptions {
  // Fetch, normalize and compare with the database, but write nothing (not even the run)
  dryRun?: boolean
  logger?: Logger
  // Writes are sent to the database in batches of this many statements
  batchSize?: number
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
  return result.data
}

// Fetches every job of one source and stores it: new jobs are inserted, jobs whose content changed
// are updated, and the rest only get `last_seen_at` touched. A failure while fetching ends the run
// as 'failed' but keeps what was already written.
export async function ingestSource<RawJob> (source: Source<RawJob>, options: IngestOptions = {}): Promise<RunSummary> {
  const { dryRun = false, logger = console, batchSize = 100 } = options
  const seenAt = toIsoSeconds()
  const runId = dryRun ? null : await IngestionRunModel.start(source.id, seenAt)

  const counts = { fetched: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0 }
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
      if (!storedHashes.has(job.sourceId)) {
        pending.push({ statement: JobModel.upsertStatement(source.id, job, hash, seenAt), change: 'inserted' })
      } else if (storedHashes.get(job.sourceId) !== hash) {
        pending.push({ statement: JobModel.upsertStatement(source.id, job, hash, seenAt), change: 'updated' })
      } else {
        pending.push({ statement: JobModel.touchStatement(source.id, job.sourceId, seenAt), change: 'unchanged' })
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
    await IngestionRunModel.finish(runId, {
      status,
      finishedAt: toIsoSeconds(),
      fetched: counts.fetched,
      inserted: counts.inserted,
      updated: counts.updated,
      failed: counts.failed,
      error
    })
  }

  return { source: source.id, status, error, runId, ...counts }
}

// One source after the other: a source that fails does not stop the next ones
export async function runIngestion (sources: readonly Source[], options: IngestOptions = {}) {
  const summaries: RunSummary[] = []
  for (const source of sources) {
    summaries.push(await ingestSource(source, options))
  }
  return summaries
}
