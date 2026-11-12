// `pnpm ingest`: fetch jobs from external sources into the database in DATABASE_URL
import { CONFIG } from '../config.js'
import { db } from '../db/database.js'
import { JobModel } from '../models/job.js'
import { runMigrations } from '../db/migrations.js'
import { parseIngestArgs, USAGE, type IngestArgs } from './args.js'
import { runIngestion, type RunSummary } from './runner.js'
import { resolveSources } from './sources/index.js'
import type { Source } from './types.js'

function formatSummary (summary: RunSummary) {
  const counts = `fetched ${summary.fetched}, inserted ${summary.inserted}, updated ${summary.updated}, ` +
    `unchanged ${summary.unchanged}, skipped ${summary.failed}, closed ${summary.closed}`
  const outcome = summary.status === 'failed' ? ` FAILED: ${summary.error}` : ''
  return `${summary.source}: ${counts}${outcome}`
}

// Turso's free plan: 5 GB of storage (also 500M rows read and 10M rows written a month)
const FREE_STORAGE_BYTES = 5 * 1024 ** 3

const formatBytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`

async function databaseSummary () {
  const stats = await JobModel.stats()
  const size = stats.bytes === null ? 'size unknown' : `${formatBytes(stats.bytes)} of the ${formatBytes(FREE_STORAGE_BYTES)} free tier`
  const line = `Database: ${stats.listed} jobs listed, ${stats.duplicates} duplicates, ${stats.closed} closed ` +
    `(${stats.total} rows), ${size}`
  const nearLimit = stats.bytes !== null && stats.bytes > FREE_STORAGE_BYTES * 0.8
  return nearLimit ? `${line}\nWARNING: the database is above 80% of the free storage` : line
}

let args: IngestArgs
let sources: readonly Source[]
try {
  args = parseIngestArgs(process.argv.slice(2))
  sources = resolveSources(args.sourceIds, { isLocalDatabase: CONFIG.IS_LOCAL_DATABASE })
} catch (error) {
  console.error(`${(error as Error).message}\n\n${USAGE}`)
  process.exit(2)
}

if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

if (sources.length === 0) {
  console.log('No sources to run yet. Try `pnpm ingest --source=fixture` against a local database.')
  process.exit(0)
}

const applied = await runMigrations()
if (applied.length > 0) {
  console.log(`Applied migrations: ${applied.join(', ')}`)
}

const started = Date.now()
const summaries = await runIngestion(sources, { dryRun: args.dryRun })

for (const summary of summaries) {
  console.log(formatSummary(summary))
}
if (!args.dryRun) console.log(await databaseSummary())
console.log(`${args.dryRun ? 'Dry run, nothing written. ' : ''}Done in ${((Date.now() - started) / 1000).toFixed(1)}s`)

db.close()

if (summaries.some((summary) => summary.status === 'failed')) {
  process.exitCode = 1
}
