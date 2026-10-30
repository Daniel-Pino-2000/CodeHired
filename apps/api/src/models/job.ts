import { randomUUID } from 'node:crypto'
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

function toJob (row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    workplace: row.workplace,
    level: row.level,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    technologies: JSON.parse(row.technologies) as string[],
    description: row.description,
    createdAt: row.created_at
  }
}

export class JobModel {
  static getAll ({ text, technology, level, workplace, limit, offset }: JobFilters): Paginated<Job> {
    const where: string[] = []
    const params: Record<string, string | number> = {}

    if (text) {
      where.push('(title LIKE @text OR company LIKE @text OR description LIKE @text)')
      params.text = `%${text}%`
    }
    if (technology) {
      where.push('EXISTS (SELECT 1 FROM json_each(jobs.technologies) WHERE lower(value) = lower(@technology))')
      params.technology = technology
    }
    if (level) {
      where.push('level = @level')
      params.level = level
    }
    if (workplace) {
      where.push('workplace = @workplace')
      params.workplace = workplace
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM jobs ${whereClause}`)
      .get(params) as { total: number }

    const rows = db
      .prepare(`SELECT * FROM jobs ${whereClause} ORDER BY created_at DESC, id LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset }) as JobRow[]

    return { data: rows.map(toJob), total, limit, offset }
  }

  static getById (id: string): Job | undefined {
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? toJob(row) : undefined
  }

  static create (job: NewJob & { createdAt?: string }): Job {
    const id = randomUUID()

    db.prepare(`
      INSERT INTO jobs (id, title, company, location, workplace, level, employment_type,
                        salary_min, salary_max, currency, technologies, description, created_at)
      VALUES (@id, @title, @company, @location, @workplace, @level, @employmentType,
              @salaryMin, @salaryMax, @currency, @technologies, @description,
              COALESCE(@createdAt, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))
    `).run({
      ...job,
      id,
      technologies: JSON.stringify(job.technologies),
      createdAt: job.createdAt ?? null
    })

    return JobModel.getById(id)!
  }

  static count (): number {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM jobs').get() as { total: number }
    return total
  }
}
