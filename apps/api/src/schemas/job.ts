import { z } from 'zod'
import { CONFIG } from '../config.js'
import { EMPLOYMENT_TYPES, LEVELS, WORKPLACES } from '../types.js'

// Query string for GET /jobs. Empty strings (e.g. `?level=`) are treated as "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const jobFiltersSchema = z.object({
  text: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  technology: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  level: z.preprocess(emptyToUndefined, z.enum(LEVELS).optional()),
  workplace: z.preprocess(emptyToUndefined, z.enum(WORKPLACES).optional()),
  limit: z.coerce.number().int().min(1).max(CONFIG.MAX_PAGE_SIZE).default(CONFIG.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0)
})

// Body for creating a job (used by the seed today, and by POST /jobs later)
export const jobSchema = z.object({
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
}).refine(
  (job) => job.salaryMin === null || job.salaryMax === null || job.salaryMin <= job.salaryMax,
  { message: 'salaryMin must be less than or equal to salaryMax', path: ['salaryMin'] }
)

export type JobInput = z.infer<typeof jobSchema>
