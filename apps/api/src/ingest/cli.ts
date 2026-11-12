// `pnpm ingest`: fetch jobs from external sources into the database in DATABASE_URL
import { appendFile } from 'node:fs/promises'
import { CONFIG } from '../config.js'
import { db } from '../db/database.js'
import { JobModel } from '../models/job.js'
import { IngestionRunModel } from '../models/ingestion-run.js'
import { runMigrations } from '../db/migrations.js'
import { parseIngestArgs, USAGE, type IngestArgs } from './args.js'
import { formatDatabaseLine, formatMarkdownReport, formatNotDueLine, formatSummaryLine } from './report.js'
import { runIngestion } from './runner.js'
import { splitDueSources, type NotDue } from './schedule.js'
import { resolveSources } from './sources/index.js'
import type { Source } from './types.js'

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

let notDue: NotDue[] = []
if (args.due) {
  const split = splitDueSources(sources, await IngestionRunModel.lastStarted())
  sources = split.due
  notDue = split.notDue
  for (const skipped of notDue) console.log(formatNotDueLine(skipped))
}

// With nothing due, the housekeeping is skipped too: the last run already did it
const summaries = sources.length > 0 ? await runIngestion(sources, { dryRun: args.dryRun }) : []

for (const summary of summaries) {
  console.log(formatSummaryLine(summary))
}
const database = args.dryRun ? null : await JobModel.stats()
if (database) console.log(formatDatabaseLine(database))
const durationMs = Date.now() - started
console.log(`${args.dryRun ? 'Dry run, nothing written. ' : ''}Done in ${(durationMs / 1000).toFixed(1)}s`)

// On GitHub Actions, the same report as a table on the run's page
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, formatMarkdownReport({ summaries, notDue, database, dryRun: args.dryRun, durationMs }))
}

db.close()

if (summaries.some((summary) => summary.status === 'failed')) {
  process.exitCode = 1
}
