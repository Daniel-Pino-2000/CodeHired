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
    // Jobs that disappeared from their source stay in the table but are no longer listed, and
    // an opening listed by several sources is shown once
    const where: string[] = ['closed_at IS NULL', 'duplicate_of IS NULL']
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
  static upsertStatement (source: string, job: NormalizedJob, contentHash: string, seenAt: string, fingerprint: string): InStatement {
    return {
      sql: `
        INSERT INTO jobs (id, source, source_id, source_url, publisher, title, company, location,
                          city, state, country, remote, workplace, level, employment_type,
                          salary_min, salary_max, currency, technologies, description_text,
                          description_html, posted_at, content_hash, fingerprint, last_seen_at, created_at)
        VALUES (@id, @source, @sourceId, @sourceUrl, @publisher, @title, @company, @location,
                @city, @state, @country, @remote, @workplace, @level, @employmentType,
                @salaryMin, @salaryMax, @currency, @technologies, @description,
                @descriptionHtml, @postedAt, @contentHash, @fingerprint, @seenAt, COALESCE(@postedAt, @seenAt))
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
          fingerprint      = excluded.fingerprint,
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
        fingerprint,
        seenAt
      }
    }
  }

  // The job is still listed and has not changed: only record that it was seen. The fingerprint is
  // refreshed too, since jobs stored before fingerprints existed have none.
  static touchStatement (source: string, sourceId: string, seenAt: string, fingerprint: string): InStatement {
    return {
      sql: 'UPDATE jobs SET last_seen_at = ?, fingerprint = ?, closed_at = NULL WHERE source = ? AND source_id = ?',
      args: [seenAt, fingerprint, source, sourceId]
    }
  }

  // Closes the open jobs of a source that its last `runs` successful runs (`runId` counts as one)
  // did not see, and, unless `maxPostedAt` is null, the ones posted before it. Returns how many.
  static async closeStale (source: string, { runId, runs, maxPostedAt, now }: {
    runId: number
    runs: number
    maxPostedAt: string | null
    now: string
  }): Promise<number> {
    const { rowsAffected } = await db.execute({
      sql: `
        UPDATE jobs SET closed_at = @now
        WHERE source = @source AND closed_at IS NULL AND (
          last_seen_at < (
            SELECT started_at FROM ingestion_runs
            WHERE source = @source AND (status = 'succeeded' OR id = @runId)
            ORDER BY started_at DESC, id DESC
            LIMIT 1 OFFSET @offset
          )
          OR COALESCE(posted_at, created_at) < @maxPostedAt
        )
      `,
      // Fewer runs than `runs` so far: the subquery is NULL and only the age rule applies
      args: { source, runId, offset: runs - 1, maxPostedAt, now }
    })
    return rowsAffected
  }

  // Deletes jobs closed before `closedBefore`. Jobs created here (the seed) are never deleted.
  static async deleteClosed (closedBefore: string): Promise<number> {
    const { rowsAffected } = await db.execute({
      sql: "DELETE FROM jobs WHERE closed_at < ? AND source <> 'seed'",
      args: [closedBefore]
    })
    return rowsAffected
  }

  // Groups the open jobs by fingerprint and keeps one listed per group: the one from the source
  // with the lowest priority number, then the oldest. Copies from other sources point to it with
  // `duplicate_of`; copies from the canonical job's own source stay listed, since one board
  // posting the same title twice in a city usually means two openings. Then rebuilds
  // `job_sources`. Everything is recomputed, so a canonical job that closes hands over to the next.
  static async rebuildDuplicates (priorities: ReadonlyMap<string, number>, defaultPriority: number) {
    const cases = [...priorities].map(() => 'WHEN ? THEN ?').join(' ')
    const priority = cases ? `CASE source ${cases} ELSE ? END` : '?'
    const priorityArgs = [...[...priorities].flat(), defaultPriority]

    await db.batch([
      'UPDATE jobs SET duplicate_of = NULL WHERE duplicate_of IS NOT NULL',
      {
        sql: `
          WITH ranked AS (
            SELECT id, source,
                   first_value(id) OVER copies AS canonical_id,
                   first_value(source) OVER copies AS canonical_source
            FROM jobs
            WHERE closed_at IS NULL AND fingerprint IS NOT NULL
            WINDOW copies AS (PARTITION BY fingerprint ORDER BY ${priority}, created_at, id)
          )
          UPDATE jobs SET duplicate_of = ranked.canonical_id
          FROM ranked
          WHERE ranked.id = jobs.id AND ranked.source <> ranked.canonical_source
        `,
        args: priorityArgs
      },
      'DELETE FROM job_sources',
      `
        INSERT INTO job_sources (job_id, source, source_id, source_url, publisher, last_seen_at)
        SELECT COALESCE(duplicate_of, id), source, source_id, source_url, publisher, last_seen_at
        FROM jobs
        WHERE closed_at IS NULL AND source_id IS NOT NULL
      `
    ], 'write')
  }

  // Where a job appears: the canonical job first, then its copies
  static async getSources (jobId: string) {
    const { rows } = await db.execute({
      sql: `
        SELECT job_sources.source, job_sources.source_url, job_sources.publisher
        FROM job_sources JOIN jobs ON jobs.source = job_sources.source AND jobs.source_id = job_sources.source_id
        WHERE job_sources.job_id = ?
        ORDER BY jobs.id <> job_sources.job_id, job_sources.source
      `,
      args: [jobId]
    })
    return rows.map((row) => ({
      source: String(row.source),
      sourceUrl: row.source_url as string | null,
      publisher: row.publisher as string | null
    }))
  }

  // What the database holds, to keep an eye on the hosting free tier
  static async stats () {
    const { rows: [counts] } = await db.execute(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(closed_at IS NULL AND duplicate_of IS NULL), 0) AS listed,
             COALESCE(SUM(closed_at IS NULL AND duplicate_of IS NOT NULL), 0) AS duplicates,
             COALESCE(SUM(closed_at IS NOT NULL), 0) AS closed
      FROM jobs
    `)
    let bytes: number | null = null
    try {
      const { rows: [size] } = await db.execute('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()')
      bytes = Number(size.bytes)
    } catch {
      // Not every libSQL server exposes the pragmas
    }
    return {
      total: Number(counts.total),
      listed: Number(counts.listed),
      duplicates: Number(counts.duplicates),
      closed: Number(counts.closed),
      bytes
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
