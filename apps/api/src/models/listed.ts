import { CONFIG } from '../config.js'

// Jobs that are not shown: closed (gone from their source), copies of a job listed from a
// higher-priority source, and the fictional seed jobs outside a local database. Conditions on
// `jobs`, for any query that lists or counts jobs.
export const LISTED = [
  'jobs.closed_at IS NULL',
  'jobs.duplicate_of IS NULL',
  ...(CONFIG.IS_LOCAL_DATABASE ? [] : ["jobs.source <> 'seed'"])
]
