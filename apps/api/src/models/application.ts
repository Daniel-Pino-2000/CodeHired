import type { InValue, Row } from '@libsql/client'
import { CONFIG } from '../config.js'
import { db } from '../db/database.js'
import { getSource } from '../ingest/sources/index.js'
import type { ApplicationChanges, NewApplication } from '../schemas/application.js'
import type { Application, ApplicationStatus } from '../types.js'

// The fictional seed jobs can only be tracked where they are shown: in a local database
const SEED = CONFIG.IS_LOCAL_DATABASE ? '' : "AND jobs.source <> 'seed'"

// Closed (gone from its source) or past its application deadline, like LISTED in listed.ts.
// NULL for a manual entry, which has no job.
const OPEN = `
  CASE WHEN jobs.id IS NULL THEN NULL
       ELSE jobs.closed_at IS NULL AND (jobs.closes_at IS NULL OR jobs.closes_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  END
`

const SELECT = `
  SELECT applications.*, ${OPEN} AS is_open
  FROM applications LEFT JOIN jobs ON jobs.id = applications.job_id
`

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"

// The API's columns for each field PATCH can change
const COLUMNS = {
  company: 'company',
  title: 'title',
  url: 'url',
  source: 'source',
  status: 'status',
  notes: 'notes',
  appliedAt: 'applied_at',
  followUpAt: 'follow_up_at'
} as const satisfies Record<keyof ApplicationChanges, string>

const nullableString = (value: unknown) => (value === null || value === undefined ? null : String(value))

function toApplication (row: Row): Application {
  return {
    id: Number(row.id),
    jobId: nullableString(row.job_id),
    company: String(row.company),
    title: String(row.title),
    url: nullableString(row.url),
    source: nullableString(row.source),
    status: row.status as ApplicationStatus,
    notes: String(row.notes),
    appliedAt: nullableString(row.applied_at),
    followUpAt: nullableString(row.follow_up_at),
    open: row.is_open === null ? null : Boolean(row.is_open),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

// Today in UTC, YYYY-MM-DD: when an application leaves 'saved' without saying when. The web app
// sends the candidate's own date, so this is only the fallback for other clients.
const utcToday = (now: Date) => now.toISOString().slice(0, 10)

export type CreateResult =
  | { application: Application }
  | { error: 'job-not-found' }
  | { error: 'already-tracked', id: number }

export class ApplicationModel {
  // Every application the user tracks, the most recently changed first
  static async getAll (userId: number): Promise<Application[]> {
    const { rows } = await db.execute({
      sql: `${SELECT} WHERE applications.user_id = ? ORDER BY applications.updated_at DESC, applications.id DESC`,
      args: [userId]
    })
    return rows.map(toApplication)
  }

  static async getById (userId: number, id: number): Promise<Application | null> {
    const { rows } = await db.execute({
      sql: `${SELECT} WHERE applications.user_id = ? AND applications.id = ?`,
      args: [userId, id]
    })
    return rows.length > 0 ? toApplication(rows[0]) : null
  }

  static async create (userId: number, input: NewApplication, now: Date = new Date()): Promise<CreateResult> {
    let details = {
      jobId: null as string | null,
      company: input.company!,
      title: input.title!,
      url: input.url ?? null,
      source: input.source ?? null
    }

    if (input.jobId) {
      const { rows } = await db.execute({
        sql: `SELECT id, company, title, source, source_url, publisher FROM jobs WHERE jobs.id = ? ${SEED}`,
        args: [input.jobId]
      })
      if (rows.length === 0) return { error: 'job-not-found' }
      const [job] = rows
      details = {
        jobId: String(job.id),
        company: String(job.company),
        title: String(job.title),
        url: nullableString(job.source_url),
        // Who published it ("LinkedIn" for a JSearch job), else the source's name ("Greenhouse").
        // The seed jobs were created here: they have no source to name.
        source: nullableString(job.publisher) ?? (job.source === 'seed' ? null : getSource(String(job.source))?.attribution.label ?? null)
      }
    }

    const appliedAt = input.appliedAt !== undefined
      ? input.appliedAt
      : input.status === 'saved' ? null : utcToday(now)

    // The conflict target names the partial index's WHERE, so only a second application to the
    // same CodeHired job conflicts
    const { rows } = await db.execute({
      sql: `
        INSERT INTO applications (user_id, job_id, company, title, url, source, status, notes, applied_at, follow_up_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, job_id) WHERE job_id IS NOT NULL DO NOTHING
        RETURNING id
      `,
      args: [
        userId, details.jobId, details.company, details.title, details.url, details.source,
        input.status, input.notes, appliedAt, input.followUpAt ?? null
      ]
    })

    if (rows.length === 0) {
      const { rows: existing } = await db.execute({
        sql: 'SELECT id FROM applications WHERE user_id = ? AND job_id = ?',
        args: [userId, details.jobId]
      })
      return { error: 'already-tracked', id: Number(existing[0].id) }
    }

    return { application: (await ApplicationModel.getById(userId, Number(rows[0].id)))! }
  }

  // Changes the fields given. Null when the user has no such application.
  static async update (userId: number, id: number, changes: ApplicationChanges, now: Date = new Date()): Promise<Application | null> {
    const assignments: string[] = []
    const args: InValue[] = []

    for (const [field, column] of Object.entries(COLUMNS) as [keyof ApplicationChanges, string][]) {
      const value = changes[field]
      if (value === undefined) continue
      assignments.push(`${column} = ?`)
      args.push(value)
    }

    // Moving past 'saved' means they applied: date it today unless it already has a date
    if (changes.status && changes.status !== 'saved' && changes.appliedAt === undefined) {
      assignments.push('applied_at = COALESCE(applied_at, ?)')
      args.push(utcToday(now))
    }

    const { rowsAffected } = await db.execute({
      sql: `UPDATE applications SET ${assignments.join(', ')}, updated_at = ${NOW} WHERE user_id = ? AND id = ?`,
      args: [...args, userId, id]
    })
    return rowsAffected > 0 ? ApplicationModel.getById(userId, id) : null
  }

  static async remove (userId: number, id: number): Promise<void> {
    await db.execute({ sql: 'DELETE FROM applications WHERE user_id = ? AND id = ?', args: [userId, id] })
  }
}
