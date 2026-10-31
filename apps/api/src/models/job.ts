import { randomUUID } from 'node:crypto'
import type { InStatement, InValue, Row } from '@libsql/client'
import { db } from '../db/database.js'
import type { Job, JobFilters, Paginated } from '../types.js'

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
  description: string
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
    description: job.description,
    createdAt: job.created_at
  }
}

export class JobModel {
  static async getAll ({ text, technology, level, workplace, limit, offset }: JobFilters): Promise<Paginated<Job>> {
    const where: string[] = []
    const args: Record<string, InValue> = {}

    if (text) {
      where.push('(title LIKE @text OR company LIKE @text OR description LIKE @text)')
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

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

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
  static insertStatement (job: NewJob & { id?: string, createdAt?: string }): InStatement {
    return {
      sql: `
        INSERT INTO jobs (id, title, company, location, workplace, level, employment_type,
                          salary_min, salary_max, currency, technologies, description, created_at)
        VALUES (@id, @title, @company, @location, @workplace, @level, @employmentType,
                @salaryMin, @salaryMax, @currency, @technologies, @description,
                COALESCE(@createdAt, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))
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
        createdAt: job.createdAt ?? null
      }
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
