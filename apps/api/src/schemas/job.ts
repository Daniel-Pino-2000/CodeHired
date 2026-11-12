import { z } from 'zod'
import { CONFIG } from '../config.js'
import { US_STATES } from '../ingest/filters.js'
import { EMPLOYMENT_TYPES, JOB_SORTS, LEVELS, POSTED_WITHIN, WORKPLACES } from '../types.js'

// Query string for GET /jobs. Empty strings (e.g. `?level=`) are treated as "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const MAX_SALARY_FILTER = 2_000_000

// What CompanyModel makes slugs of: lowercase letters and digits, single dashes between words
export const COMPANY_SLUG = z.string().trim().toLowerCase().max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

// Query string for GET /companies
export const companyFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(CONFIG.MAX_COMPANIES_PAGE_SIZE).default(CONFIG.DEFAULT_COMPANIES_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0)
})

export const jobFiltersSchema = z.object({
  text: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  technology: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  level: z.preprocess(emptyToUndefined, z.enum(LEVELS).optional()),
  workplace: z.preprocess(emptyToUndefined, z.enum(WORKPLACES).optional()),
  employmentType: z.preprocess(emptyToUndefined, z.enum(EMPLOYMENT_TYPES).optional()),
  // Posted (or first seen) within this window
  postedWithin: z.preprocess(emptyToUndefined, z.enum(POSTED_WITHIN).optional()),
  // Two-letter US state code, any case: `tx`, `TX`
  state: z.preprocess(
    emptyToUndefined,
    z.string().trim().toUpperCase().refine((code) => Object.hasOwn(US_STATES, code), 'Unknown US state code').optional()
  ),
  // Yearly USD. Matches jobs whose range reaches it, so it hides jobs without a salary; leaving it
  // out (the default) lists every job
  minSalary: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(MAX_SALARY_FILTER).optional()),
  // `true`: only jobs that state a salary. `false` is the same as leaving it out
  hasSalary: z.preprocess(emptyToUndefined, z.stringbool().optional()),
  // `jobs.source`: `greenhouse`, `remoteok`... (GET /sources lists them)
  source: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/).optional()),
  // A company's slug (GET /companies lists them)
  company: z.preprocess(emptyToUndefined, COMPANY_SLUG.optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(JOB_SORTS).default('newest')),
  limit: z.coerce.number().int().min(1).max(CONFIG.MAX_PAGE_SIZE).default(CONFIG.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0)
})

// Fields every job has, wherever it comes from. Kept without refinements so it can be extended.
export const jobFieldsSchema = z.object({
  title: z.string().trim().min(3).max(120),
  company: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(80),
  workplace: z.enum(WORKPLACES),
  level: z.enum(LEVELS),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('full-time'),
  salaryMin: z.number().int().positive().nullable().default(null),
  salaryMax: z.number().int().positive().nullable().default(null),
  currency: z.string().length(3).default('USD'),
  technologies: z.array(z.string().trim().min(1)).max(15).default([]),
  description: z.string().trim().min(20)
})

// Shared by every schema built on `jobFieldsSchema`
export function withValidSalaryRange<T extends z.ZodType<{ salaryMin: number | null, salaryMax: number | null }>> (schema: T) {
  return schema.refine(
    (job) => job.salaryMin === null || job.salaryMax === null || job.salaryMin <= job.salaryMax,
    { message: 'salaryMin must be less than or equal to salaryMax', path: ['salaryMin'] }
  )
}

// Body for creating a job (used by the seed today, and by POST /jobs later)
export const jobSchema = withValidSalaryRange(jobFieldsSchema)

export type JobInput = z.infer<typeof jobSchema>
