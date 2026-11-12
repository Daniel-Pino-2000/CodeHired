import { randomUUID } from 'node:crypto'
import type { InStatement, InValue, Row } from '@libsql/client'
import { db } from '../db/database.js'
import type { NormalizedJob } from '../ingest/schema.js'
import type { Job, JobFilters, Paginated } from '../types.js'
import { toIsoSeconds } from '../utils/dates.js'

interface JobRow {
  id: string
  title: string
  company: string
  location: string
  workplace: Job['workplace']
  level: Job['level']
  employment_type: Job['employmentType']
  salary_min: number | null
  salary_max: number | null
  currency: string
  technologies: string
  description_text: string
  created_at: string
}

export type NewJob = Omit<Job, 'id' | 'createdAt'>

function toJob (row: Row): Job {
  const job = row as unknown as JobRow

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workplace: job.workplace,
    level: job.level,
    employmentType: job.employment_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    currency: job.currency,
    technologies: JSON.parse(job.technologies) as string[],
    description: job.description_text,
    createdAt: job.created_at
  }
}

export class JobModel {
  static async getAll ({ text, technology, level, workplace, limit, offset }: JobFilters): Promise<Paginated<Job>> {
    // Jobs that disappeared from their source stay in the table but are no longer listed
    const where: string[] = ['closed_at IS NULL']
    const args: Record<string, InValue> = {}

    if (text) {
      where.push('(title LIKE @text OR company LIKE @text OR description_text LIKE @text)')
      args.text = `%${text}%`
    }
    if (technology) {
      where.push('EXISTS (SELECT 1 FROM json_each(jobs.technologies) WHERE lower(value) = lower(@technology))')
      args.technology = technology
    }
    if (level) {
      where.push('level = @level')
      args.level = level
    }
    if (workplace) {
      where.push('workplace = @workplace')
      args.workplace = workplace
    }

    const whereClause = `WHERE ${where.join(' AND ')}`

    // Both queries in one round trip (matters with a hosted database)
    const [countResult, pageResult] = await db.batch([
      { sql: `SELECT COUNT(*) AS total FROM jobs ${whereClause}`, args },
      {
        sql: `SELECT * FROM jobs ${whereClause} ORDER BY created_at DESC, id LIMIT @limit OFFSET @offset`,
        args: { ...args, limit, offset }
      }
    ], 'read')

    return {
      data: pageResult.rows.map(toJob),
      total: Number(countResult.rows[0].total),
      limit,
      offset
    }
  }

  static async getById (id: string): Promise<Job | undefined> {
    const { rows } = await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [id] })
    return rows[0] ? toJob(rows[0]) : undefined
  }

  // The INSERT on its own, so callers can run many of them in one batch
  // Jobs created here (the seed, POST /jobs later) are their own source: `source` keeps its
  // default of 'seed' and `source_id` is the job id
  static insertStatement (job: NewJob & { id?: string, createdAt?: string }): InStatement {
    return {
      sql: `
        INSERT INTO jobs (id, source_id, title, company, location, workplace, remote, level,
                          employment_type, salary_min, salary_max, currency, technologies,
                          description_text, posted_at, last_seen_at, created_at)
        VALUES (@id, @id, @title, @company, @location, @workplace, @workplace = 'remote', @level,
                @employmentType, @salaryMin, @salaryMax, @currency, @technologies,
                @description, @createdAt, @createdAt, @createdAt)
      `,
      args: {
        id: job.id ?? randomUUID(),
        title: job.title,
        company: job.company,
        location: job.location,
        workplace: job.workplace,
        level: job.level,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        technologies: JSON.stringify(job.technologies),
        description: job.description,
        createdAt: job.createdAt ?? toIsoSeconds()
      }
    }
  }

  // `content_hash` of every job a source has stored, keyed by `source_id`
  static async getContentHashes (source: string): Promise<Map<string, string | null>> {
    const { rows } = await db.execute({
      sql: 'SELECT source_id, content_hash FROM jobs WHERE source = ?',
      args: [source]
    })
    return new Map(rows.map((row) => [String(row.source_id), row.content_hash as string | null]))
  }

  // Inserts a job from an external source, or overwrites the stored copy when it already exists.
  // `created_at` is only set on insert: the posting date when the source has one, otherwise the
  // first time CodeHired saw the job.
  static upsertStatement (source: string, job: NormalizedJob, contentHash: string, seenAt: string): InStatement {
    return {
      sql: `
        INSERT INTO jobs (id, source, source_id, source_url, publisher, title, company, location,
                          city, state, country, remote, workplace, level, employment_type,
                          salary_min, salary_max, currency, technologies, description_text,
                          description_html, posted_at, content_hash, last_seen_at, created_at)
        VALUES (@id, @source, @sourceId, @sourceUrl, @publisher, @title, @company, @location,
                @city, @state, @country, @remote, @workplace, @level, @employmentType,
                @salaryMin, @salaryMax, @currency, @technologies, @description,
                @descriptionHtml, @postedAt, @contentHash, @seenAt, COALESCE(@postedAt, @seenAt))
        ON CONFLICT (source, source_id) DO UPDATE SET
          source_url       = excluded.source_url,
          publisher        = excluded.publisher,
          title            = excluded.title,
          company          = excluded.company,
          location         = excluded.location,
          city             = excluded.city,
          state            = excluded.state,
          country          = excluded.country,
          remote           = excluded.remote,
          workplace        = excluded.workplace,
          level            = excluded.level,
          employment_type  = excluded.employment_type,
          salary_min       = excluded.salary_min,
          salary_max       = excluded.salary_max,
          currency         = excluded.currency,
          technologies     = excluded.technologies,
          description_text = excluded.description_text,
          description_html = excluded.description_html,
          posted_at        = excluded.posted_at,
          content_hash     = excluded.content_hash,
          last_seen_at     = excluded.last_seen_at,
          closed_at        = NULL
      `,
      args: {
        id: randomUUID(),
        source,
        sourceId: job.sourceId,
        sourceUrl: job.sourceUrl,
        publisher: job.publisher,
        title: job.title,
        company: job.company,
        location: job.location,
        city: job.city,
        state: job.state,
        country: job.country,
        remote: job.remote ? 1 : 0,
        workplace: job.workplace,
        level: job.level,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        technologies: JSON.stringify(job.technologies),
        description: job.description,
        descriptionHtml: job.descriptionHtml,
        postedAt: job.postedAt,
        contentHash,
        seenAt
      }
    }
  }

  // The job is still listed and has not changed: only record that it was seen
  static touchStatement (source: string, sourceId: string, seenAt: string): InStatement {
    return {
      sql: 'UPDATE jobs SET last_seen_at = ?, closed_at = NULL WHERE source = ? AND source_id = ?',
      args: [seenAt, source, sourceId]
    }
  }

  static async create (job: NewJob & { createdAt?: string }): Promise<Job> {
    const id = randomUUID()
    await db.execute(JobModel.insertStatement({ ...job, id }))
    return (await JobModel.getById(id))!
  }

  static async count (): Promise<number> {
    const { rows } = await db.execute('SELECT COUNT(*) AS total FROM jobs')
    return Number(rows[0].total)
  }
}
