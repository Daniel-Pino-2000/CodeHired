import { CONFIG } from '../config.js'
import { db } from '../db/database.js'
import type { SavedJob } from '../types.js'
import { JOB_COLUMNS, JOBS_WITH_COMPANY, toJob } from './job.js'

// The fictional seed jobs can only be saved and listed where they are shown: in a local database
const SEED = CONFIG.IS_LOCAL_DATABASE ? '' : "AND jobs.source <> 'seed'"

// Closed (gone from its source) or past its application deadline, like LISTED in listed.ts
const OPEN = `
  jobs.closed_at IS NULL AND (jobs.closes_at IS NULL OR jobs.closes_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
`

export class SavedJobModel {
  // Every job the user saved, the most recently saved first. Closed jobs and copies of another
  // listing are included: the user saved them, so they stay until the job itself is deleted.
  static async getAll (userId: number): Promise<SavedJob[]> {
    const { rows } = await db.execute({
      sql: `
        SELECT ${JOB_COLUMNS}, saved_jobs.created_at AS saved_at, ${OPEN} AS is_open
        FROM ${JOBS_WITH_COMPANY} JOIN saved_jobs ON saved_jobs.job_id = jobs.id
        WHERE saved_jobs.user_id = ? ${SEED}
        ORDER BY saved_jobs.created_at DESC, jobs.id
      `,
      args: [userId]
    })
    return rows.map((row) => ({
      ...toJob(row),
      savedAt: String(row.saved_at),
      open: Boolean(row.is_open)
    }))
  }

  // Saves the job, or does nothing when it is already saved. False when there is no such job.
  static async save (userId: number, jobId: string): Promise<boolean> {
    // Nothing is inserted for a job that doesn't exist, so the foreign key never fails. (The
    // SELECT needs its WHERE clause: without one SQLite would read ON CONFLICT as a join's ON.)
    const { rowsAffected } = await db.execute({
      sql: `
        INSERT INTO saved_jobs (user_id, job_id)
        SELECT ?, jobs.id FROM jobs WHERE jobs.id = ? ${SEED}
        ON CONFLICT (user_id, job_id) DO NOTHING
      `,
      args: [userId, jobId]
    })
    return rowsAffected > 0 || await SavedJobModel.isSaved(userId, jobId)
  }

  static async remove (userId: number, jobId: string): Promise<void> {
    await db.execute({ sql: 'DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?', args: [userId, jobId] })
  }

  static async isSaved (userId: number, jobId: string): Promise<boolean> {
    const { rows } = await db.execute({
      sql: 'SELECT 1 FROM saved_jobs WHERE user_id = ? AND job_id = ?',
      args: [userId, jobId]
    })
    return rows.length > 0
  }
}
