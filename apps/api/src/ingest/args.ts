import { parseArgs } from 'node:util'

export const USAGE = `Usage: pnpm ingest [--source=<id>[,<id>...]] [--dry-run]

  --source   Only run these sources (repeat it or separate ids with commas)
  --dry-run  Fetch and validate, compare with the database, but write nothing
  --help     Show this message`

export interface IngestArgs {
  sourceIds: string[]
  dryRun: boolean
  help: boolean
}

// Throws on unknown flags, so a typo never turns into a full run
export function parseIngestArgs (argv: readonly string[]): IngestArgs {
  // Some pnpm versions forward the `--` separator itself
  const args = argv[0] === '--' ? argv.slice(1) : [...argv]

  const { values } = parseArgs({
    args,
    options: {
      source: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })

  const sourceIds = (values.source ?? [])
    .flatMap((value) => value.split(','))
    .map((id) => id.trim())
    .filter(Boolean)

  return { sourceIds: [...new Set(sourceIds)], dryRun: values['dry-run'], help: values.help }
}
