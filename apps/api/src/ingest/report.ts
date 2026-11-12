// What `pnpm ingest` prints, and the Markdown it writes to the GitHub Actions job summary
import type { RunSummary } from './runner.js'
import type { NotDue } from './schedule.js'

export interface DatabaseStats {
  total: number
  listed: number
  duplicates: number
  closed: number
  bytes: number | null
}

export interface IngestReport {
  summaries: readonly RunSummary[]
  // Sources `--due` left out because they ran recently
  notDue: readonly NotDue[]
  // null for a dry run, which does not look at the totals
  database: DatabaseStats | null
  dryRun: boolean
  durationMs: number
}

// Turso's free plan: 5 GB of storage (also 500M rows read and 10M rows written a month)
export const FREE_STORAGE_BYTES = 5 * 1024 ** 3

const formatBytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`
const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export function formatSummaryLine (summary: RunSummary) {
  const counts = `fetched ${summary.fetched}, inserted ${summary.inserted}, updated ${summary.updated}, ` +
    `unchanged ${summary.unchanged}, skipped ${summary.failed}, closed ${summary.closed}`
  const outcome = summary.status === 'failed' ? ` FAILED: ${summary.error}` : ''
  return `${summary.source}: ${counts}${outcome}`
}

export function formatNotDueLine ({ source, dueAt }: NotDue) {
  return `${source.id}: not due (runs at most every ${source.minHoursBetweenRuns}h), next after ${dueAt}`
}

function describeDatabase (stats: DatabaseStats) {
  const size = stats.bytes === null ? 'size unknown' : `${formatBytes(stats.bytes)} of the ${formatBytes(FREE_STORAGE_BYTES)} free tier`
  return `${stats.listed} jobs listed, ${stats.duplicates} duplicates, ${stats.closed} closed (${stats.total} rows), ${size}`
}

export const isNearStorageLimit = (stats: DatabaseStats) => stats.bytes !== null && stats.bytes > FREE_STORAGE_BYTES * 0.8

export function formatDatabaseLine (stats: DatabaseStats) {
  const line = `Database: ${describeDatabase(stats)}`
  return isNearStorageLimit(stats) ? `${line}\nWARNING: the database is above 80% of the free storage` : line
}

// A table cell: pipes would end the cell and line breaks the row
const cell = (text: string) => text.replaceAll('|', '\\|').replace(/\s*\n\s*/g, ' ')

export function formatMarkdownReport ({ summaries, notDue, database, dryRun, durationMs }: IngestReport) {
  const lines = [`## Ingestion${dryRun ? ' (dry run, nothing written)' : ''}`, '']

  if (summaries.length > 0) {
    lines.push(
      '| Source | Status | Fetched | Inserted | Updated | Unchanged | Skipped | Closed |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'
    )
    for (const s of summaries) {
      const status = s.status === 'failed' ? `❌ failed: ${cell(s.error ?? 'unknown error')}` : '✅ succeeded'
      lines.push(`| \`${s.source}\` | ${status} | ${s.fetched} | ${s.inserted} | ${s.updated} | ${s.unchanged} | ${s.failed} | ${s.closed} |`)
    }
  } else {
    lines.push('No source was due, nothing fetched.')
  }

  if (notDue.length > 0) {
    lines.push('', '**Not due yet** (each source runs at most as often as its terms allow):', '')
    for (const { source, dueAt } of notDue) {
      lines.push(`- \`${source.id}\`: every ${source.minHoursBetweenRuns}h, next after ${dueAt}`)
    }
  }

  if (database) {
    lines.push('', `**Database:** ${describeDatabase(database)}`)
    if (isNearStorageLimit(database)) lines.push('', '> [!WARNING]', '> The database is above 80% of the free storage.')
  }

  lines.push('', `Done in ${formatSeconds(durationMs)}.`, '')
  return lines.join('\n')
}
