import { CONFIG } from '../config.js'

// Jobs that are not shown: closed (gone from their source) or past their application deadline, copies of a job listed from a
// higher-priority source, and the fictional seed jobs outside a local database. Conditions on
// `jobs`, for any query that lists or counts jobs.
export const LISTED = [
  'jobs.closed_at IS NULL',
  // Between runs too: the next run of the source also closes it (`closed_at`)
  "(jobs.closes_at IS NULL OR jobs.closes_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  'jobs.duplicate_of IS NULL',
  ...(CONFIG.IS_LOCAL_DATABASE ? [] : ["jobs.source <> 'seed'"])
]
