import type {
  ApplicationStatus,
  EmploymentType,
  JobSort,
  Level,
  PostedWithin,
  UserRole,
  Workplace
} from '@codehired/shared/api'

// What the routes answer with is the contract the web app reads too, so those types live in
// packages/shared/api.d.ts
export type * from '@codehired/shared/api'

// The values each union type allows, as lists for Zod and the SQL checks. `allOf<T>()` only
// accepts a list that names every member of T, so a value added to a type in api.d.ts and
// forgotten here fails to compile (the list's type becomes `never`).
const allOf = <T extends string>() =>
  <const List extends readonly T[]>(list: List & ([T] extends [List[number]] ? unknown : never)): List => list

export const LEVELS = allOf<Level>()(['intern', 'junior', 'mid', 'senior', 'staff', 'lead'])
export const WORKPLACES = allOf<Workplace>()(['remote', 'hybrid', 'onsite'])
export const EMPLOYMENT_TYPES = allOf<EmploymentType>()(['full-time', 'part-time', 'contract', 'internship'])

// GET /jobs `postedWithin`, and how far back each one goes
export const POSTED_WITHIN = allOf<PostedWithin>()(['24h', '3d', '7d', '30d'])
export const POSTED_WITHIN_HOURS: Record<PostedWithin, number> = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 }
// GET /jobs `sort`
export const JOB_SORTS = allOf<JobSort>()(['newest', 'salary_desc'])

export const USER_ROLES = allOf<UserRole>()(['candidate', 'employer'])

// /me/applications `status`, in the order an application moves through them
export const APPLICATION_STATUSES = allOf<ApplicationStatus>()(['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'])

// GET /companies, parsed from the query
export interface CompanyFilters {
  limit: number
  offset: number
}

// GET /jobs, parsed from the query
export interface JobFilters {
  text?: string
  // Lowercase slugs: jobs that use any of them
  technology?: string[]
  level?: Level
  workplace?: Workplace
  employmentType?: EmploymentType
  postedWithin?: PostedWithin
  state?: string
  minSalary?: number
  hasSalary?: boolean
  source?: string
  // A company's slug
  company?: string
  sort?: JobSort
  limit: number
  offset: number
}
