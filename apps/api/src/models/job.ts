import { randomUUID } from 'node:crypto'
import type { InStatement, InValue, Row } from '@libsql/client'
import { CONFIG } from '../config.js'
import { db } from '../db/database.js'
import type { NormalizedJob } from '../ingest/schema.js'
import { getSource } from '../ingest/sources/index.js'
import { POSTED_WITHIN_HOURS, type Job, type JobDetail, type JobFilters, type JobSort, type JobSource, type Paginated } from '../types.js'
import { toIsoSeconds } from '../utils/dates.js'
import { sanitizeDescriptionHtml } from '../utils/sanitize.js'
import { toFtsQuery } from '../utils/search.js'
import { CompanyModel } from './company.js'
import { LISTED } from './listed.js'

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
  posted_at: string | null
  source: string
  source_url: string | null
  publisher: string | null
  // From the companies JOIN (JOBS_WITH_COMPANY)
  company_id: number | null
  company_name: string | null
  company_slug: string | null
  company_logo_url: string | null
}

export type NewJob = Omit<Job, 'id' | 'createdAt' | 'postedAt' | 'source' | 'descriptionIsSnippet' | 'companyProfile'>

// Every job column plus its company's. `companies` shares only `id` with `jobs`, so columns
// of `jobs` can stay unqualified in WHERE clauses, but `id` cannot.
const JOBS_WITH_COMPANY = `
  jobs LEFT JOIN companies ON companies.id = jobs.company_id
`
const JOB_COLUMNS = `
  jobs.*, companies.name AS company_name, companies.slug AS company_slug, companies.logo_url AS company_logo_url
`
// The same, narrowed by a text search: only jobs whose words match (migration 005). The index's
// columns share names with `jobs` (title, company, description_text, technologies), so those
// must be qualified wherever this is used.
const MATCHING_JOBS_WITH_COMPANY = `
  jobs_fts JOIN jobs ON jobs.rowid = jobs_fts.rowid
  LEFT JOIN companies ON companies.id = jobs.company_id
`

const HOUR_MS = 60 * 60 * 1000

// The highest salary a job states: the top of its range, or its only number
const TOP_SALARY = 'COALESCE(salary_max, salary_min)'

// bm25 weights per indexed column, in the order of migration 005: a word in the title counts
// most, then the company and the technologies, then the description
const RELEVANCE = 'bm25(jobs_fts, 10.0, 6.0, 1.0, 4.0)'

// `id` last, so pages never overlap when the other keys tie
const ORDER_BY: Record<Exclude<JobSort, 'relevance'>, string> = {
  newest: 'created_at DESC, jobs.id',
  // Jobs without a salary come after every job with one, newest first among equals
  salary_desc: `${TOP_SALARY} IS NULL, ${TOP_SALARY} DESC, created_at DESC, jobs.id`
}

// Lower bm25 is a better match. Without a text search there is nothing to rank: newest first.
const orderBy = (sort: JobSort, isSearch: boolean) =>
  sort === 'relevance'
    ? isSearch ? `${RELEVANCE}, created_at DESC, jobs.id` : ORDER_BY.newest
    : ORDER_BY[sort]

// Rows of `jobs` or `job_sources` without a posting URL (the seed) have no source to show
function toJobSource (row: { source: string, source_url: string | null, publisher: string | null }): JobSource | null {
  if (!row.source_url) return null
  return {
    id: row.source,
    name: getSource(row.source)?.attribution.label ?? row.source,
    publisher: row.publisher,
    url: row.source_url
  }
}

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
    descriptionIsSnippet: getSource(job.source)?.snippetOnly ?? false,
    createdAt: job.created_at,
    postedAt: job.posted_at,
    source: toJobSource(job),
    companyProfile: job.company_id !== null && job.company_slug !== null
      ? { id: Number(job.company_id), name: job.company_name!, slug: job.company_slug, logoUrl: job.company_logo_url }
      : null
  }
}

export class JobModel {
  // Every filter narrows the list (they combine with AND)
  static async getAll ({
    text,
    technology,
    level,
    workplace,
    employmentType,
    postedWithin,
    state,
    minSalary,
    hasSalary,
    source,
    company,
    sort = 'newest',
    limit,
    offset
  }: JobFilters, now: Date = new Date()): Promise<Paginated<Job>> {
    // Jobs that disappeared from their source stay in the table but are no longer listed, and
    // an opening listed by several sources is shown once
    const where: string[] = [...LISTED]
    const args: Record<string, InValue> = {}

    // Every word in the title, company, description or technologies (FTS5). Text with nothing
    // searchable in it ("!!") filters nothing.
    const match = text ? toFtsQuery(text) : null
    if (match) {
      where.push('jobs_fts MATCH @match')
      args.match = match
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
    if (employmentType) {
      where.push('employment_type = @employmentType')
      args.employmentType = employmentType
    }
    if (postedWithin) {
      // `created_at` is the posting date, or when CodeHired first saw the job
      where.push('created_at >= @postedSince')
      args.postedSince = toIsoSeconds(new Date(now.getTime() - POSTED_WITHIN_HOURS[postedWithin] * HOUR_MS))
    }
    if (state) {
      where.push('state = @state')
      args.state = state
    }
    // The top of the range is what a candidate can reach; a job with only one number uses it
    if (minSalary !== undefined) {
      where.push(`${TOP_SALARY} >= @minSalary`)
      args.minSalary = minSalary
    }
    if (hasSalary) {
      where.push(`${TOP_SALARY} IS NOT NULL`)
    }
    if (source) {
      where.push('source = @source')
      args.source = source
    }
    if (company) {
      where.push('companies.slug = @company')
      args.company = company
    }

    const whereClause = `WHERE ${where.join(' AND ')}`
    const from = match ? MATCHING_JOBS_WITH_COMPANY : JOBS_WITH_COMPANY

    // Both queries in one round trip (matters with a hosted database)
    const [countResult, pageResult] = await db.batch([
      { sql: `SELECT COUNT(*) AS total FROM ${from} ${whereClause}`, args },
      {
        sql: `SELECT ${JOB_COLUMNS} FROM ${from} ${whereClause} ORDER BY ${orderBy(sort, match !== null)} LIMIT @limit OFFSET @offset`,
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

  // Closed jobs and copies can still be opened from an old link; seed jobs only where they are listed
  static async getById (id: string): Promise<JobDetail | undefined> {
    const seed = CONFIG.IS_LOCAL_DATABASE ? '' : "AND source <> 'seed'"
    const [jobResult, sourcesResult] = await db.batch([
      { sql: `SELECT ${JOB_COLUMNS} FROM ${JOBS_WITH_COMPANY} WHERE jobs.id = ? ${seed}`, args: [id] },
      // Where else the same opening is posted: every row of the group but the job itself
      {
        sql: `
          SELECT job_sources.source, job_sources.source_url, job_sources.publisher
          FROM job_sources JOIN jobs ON jobs.id = job_sources.job_id
          WHERE job_sources.job_id = ?
            AND NOT (job_sources.source = jobs.source AND job_sources.source_id = jobs.source_id)
          ORDER BY job_sources.source, job_sources.source_id
        `,
        args: [id]
      }
    ], 'read')

    const [row] = jobResult.rows
    if (!row) return undefined

    const alsoPostedOn = sourcesResult.rows
      .map((source) => toJobSource(source as unknown as Parameters<typeof toJobSource>[0]))
      .filter((source) => source !== null)

    // Sanitized again on the way out, so rows written before ingestion sanitized (or by any other
    // path) are never served raw. Cheap: one description per request.
    const descriptionHtml = sanitizeDescriptionHtml(row.description_html as string | null)

    return { ...toJob(row), descriptionHtml, alsoPostedOn }
  }

  // The INSERT on its own, so callers can run many of them in one batch
  // Jobs created here (the seed, POST /jobs later) are their own source: `source` keeps its
  // default of 'seed' and `source_id` is the job id
  static insertStatement (job: NewJob & { id?: string, createdAt?: string, state?: string | null }): InStatement {
    return {
      sql: `
        INSERT INTO jobs (id, source_id, title, company, location, state, workplace, remote, level,
                          employment_type, salary_min, salary_max, currency, technologies,
                          description_text, posted_at, last_seen_at, created_at)
        VALUES (@id, @id, @title, @company, @location, @state, @workplace, @workplace = 'remote', @level,
                @employmentType, @salaryMin, @salaryMax, @currency, @technologies,
                @description, @createdAt, @createdAt, @createdAt)
      `,
      args: {
        id: job.id ?? randomUUID(),
        title: job.title,
        company: job.company,
        location: job.location,
        state: job.state ?? null,
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

  static async create (job: NewJob & { createdAt?: string, state?: string | null }): Promise<Job> {
    const id = randomUUID()
    await db.execute(JobModel.insertStatement({ ...job, id }))
    await CompanyModel.linkJobs()
    return (await JobModel.getById(id))!
  }

  static async count (): Promise<number> {
    const { rows } = await db.execute('SELECT COUNT(*) AS total FROM jobs')
    return Number(rows[0].total)
  }
}
