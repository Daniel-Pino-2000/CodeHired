import { jobSchema } from '../schemas/job.js'
import { JobModel } from '../models/job.js'
import { toIsoSeconds } from '../utils/dates.js'
import { db } from './database.js'
import { SEED_JOBS } from './seed-data.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Inserts the seed jobs in one transaction. Returns how many were inserted.
export async function seedJobs () {
  const inserts = SEED_JOBS.map(({ postedDaysAgo, ...job }) => {
    const createdAt = toIsoSeconds(new Date(Date.now() - postedDaysAgo * DAY_MS))
    return JobModel.insertStatement({ ...jobSchema.parse(job), createdAt })
  })

  await db.batch(inserts, 'write')
  return SEED_JOBS.length
}
