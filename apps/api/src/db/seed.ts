import { jobSchema } from '../schemas/job.js'
import { JobModel } from '../models/job.js'
import { db } from './database.js'
import { SEED_JOBS } from './seed-data.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Inserts the seed jobs in one transaction. Returns how many were inserted.
export function seedJobs () {
  const insertAll = db.transaction(() => {
    for (const { postedDaysAgo, ...job } of SEED_JOBS) {
      const createdAt = new Date(Date.now() - postedDaysAgo * DAY_MS).toISOString().slice(0, 19) + 'Z'
      JobModel.create({ ...jobSchema.parse(job), createdAt })
    }
  })

  insertAll()
  return SEED_JOBS.length
}
