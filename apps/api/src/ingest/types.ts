import type { NormalizedJobInput } from './schema.js'

// How the source must be credited wherever its jobs are shown
export interface Attribution {
  label: string
  url: string
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
  fetchJobs (): AsyncIterable<RawJob>
  // May throw: the runner counts it as a failed job and moves on
  normalize (raw: RawJob): NormalizedJobInput
}
