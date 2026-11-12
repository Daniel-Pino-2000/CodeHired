import type { NormalizedJobInput } from './schema.js'

export type Logger = Pick<Console, 'info' | 'warn' | 'error'>

// How the source must be credited wherever its jobs are shown
export interface Attribution {
  label: string
  url: string
}

// What the runner hands to `fetchJobs`
export interface FetchContext {
  // Where to report problems that do not end the run, like one company's board being down
  logger: Logger
}

// One external job source: an ATS board, a jobs API, a remote board... Adapters only fetch and
// map; validation, deduplication and writing to the database are the runner's job.
export interface Source<RawJob = unknown> {
  // Stored in `jobs.source`, and what `pnpm ingest --source=<id>` matches
  id: string
  name: string
  attribution: Attribution
  // Fictional data (the fixture source): never part of a full run, never sent to a hosted database
  devOnly?: boolean
  // Throwing ends the run as 'failed'; a source made of many boards should skip a broken one instead
  fetchJobs (context: FetchContext): AsyncIterable<RawJob>
  // May throw: the runner counts it as a failed job and moves on
  normalize (raw: RawJob): NormalizedJobInput
}
