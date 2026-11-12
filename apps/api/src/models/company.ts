import type { InStatement, Row } from '@libsql/client'
import { db } from '../db/database.js'
import type { Company as KnownCompany } from '../ingest/companies.js'
import { fingerprintCompany } from '../ingest/dedupe.js'
import type { Company, CompanyFilters, Paginated } from '../types.js'
import { LISTED } from './listed.js'

// "acme widgets" → "acme-widgets". The key only holds lowercase letters, digits and single
// spaces, so two keys never give the same slug.
const slugFromKey = (key: string) => key.replaceAll(' ', '-')

function toCompany (row: Row): Company {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    website: row.website as string | null,
    logoUrl: row.logo_url as string | null,
    ats: row.ats as string | null,
    openJobs: Number(row.open_jobs ?? 0)
  }
}

// Open jobs per company, counted the same way GET /jobs lists them
const OPEN_JOBS = `
  SELECT company_id, COUNT(*) AS open_jobs
  FROM jobs
  WHERE company_id IS NOT NULL AND ${LISTED.join(' AND ')}
  GROUP BY company_id
`

export class CompanyModel {
  // The companies whose boards CodeHired reads: their name and website win over what a job says
  static async syncKnown (companies: readonly KnownCompany[]) {
    const statements: InStatement[] = []
    const seen = new Set<string>()
    for (const company of companies) {
      const key = fingerprintCompany(company.name)
      // One company on two ATS platforms is one row
      if (!key || seen.has(key)) continue
      seen.add(key)
      statements.push({
        sql: `
          INSERT INTO companies (name, slug, name_key, website, ats)
          VALUES (@name, @slug, @key, @website, @ats)
          ON CONFLICT (name_key) DO UPDATE SET
            name = excluded.name, website = excluded.website, ats = excluded.ats
        `,
        args: { name: company.name, slug: slugFromKey(key), key, website: company.website, ats: company.ats }
      })
    }
    if (statements.length > 0) await db.batch(statements, 'write')
  }

  // Gives every job without a company one: the company with the same normalized name, created on
  // the way when it is new. Run after jobs are written (ingestion, seed). Returns the jobs linked.
  static async linkJobs (): Promise<number> {
    const { rows } = await db.execute('SELECT DISTINCT company FROM jobs WHERE company_id IS NULL')
    const statements: InStatement[] = []
    for (const row of rows) {
      const name = String(row.company)
      const key = fingerprintCompany(name)
      // A name made only of a legal suffix ("LLC") names no company
      if (!key) continue
      statements.push(
        {
          sql: 'INSERT INTO companies (name, slug, name_key) VALUES (?, ?, ?) ON CONFLICT (name_key) DO NOTHING',
          args: [name, slugFromKey(key), key]
        },
        {
          sql: 'UPDATE jobs SET company_id = (SELECT id FROM companies WHERE name_key = ?) WHERE company_id IS NULL AND company = ?',
          args: [key, name]
        }
      )
    }
    if (statements.length === 0) return 0
    const results = await db.batch(statements, 'write')
    return results.filter((_, index) => index % 2 === 1).reduce((total, result) => total + result.rowsAffected, 0)
  }

  // Companies with open jobs, the most open jobs first
  static async getAll ({ limit, offset }: CompanyFilters): Promise<Paginated<Company>> {
    const [countResult, pageResult] = await db.batch([
      { sql: `SELECT COUNT(*) AS total FROM (${OPEN_JOBS})`, args: [] },
      {
        sql: `
          SELECT companies.*, counts.open_jobs
          FROM companies JOIN (${OPEN_JOBS}) AS counts ON counts.company_id = companies.id
          ORDER BY counts.open_jobs DESC, companies.name, companies.id
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset]
      }
    ], 'read')

    return {
      data: pageResult.rows.map(toCompany),
      total: Number(countResult.rows[0].total),
      limit,
      offset
    }
  }

  // Any company, with or without open jobs (an old link to a company that stopped hiring still works)
  static async getBySlug (slug: string): Promise<Company | undefined> {
    const { rows: [row] } = await db.execute({
      sql: `
        SELECT companies.*, COALESCE(counts.open_jobs, 0) AS open_jobs
        FROM companies LEFT JOIN (${OPEN_JOBS}) AS counts ON counts.company_id = companies.id
        WHERE companies.slug = ?
      `,
      args: [slug]
    })
    return row ? toCompany(row) : undefined
  }
}
