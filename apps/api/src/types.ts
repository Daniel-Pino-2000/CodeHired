export const LEVELS = ['intern', 'junior', 'mid', 'senior', 'staff', 'lead'] as const
export const WORKPLACES = ['remote', 'hybrid', 'onsite'] as const
export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship'] as const

// GET /jobs `postedWithin`, and how far back each one goes
export const POSTED_WITHIN = ['24h', '3d', '7d', '30d'] as const
export const POSTED_WITHIN_HOURS: Record<PostedWithin, number> = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 }
// GET /jobs `sort`
export const JOB_SORTS = ['newest', 'salary_desc'] as const

export type PostedWithin = (typeof POSTED_WITHIN)[number]
export type JobSort = (typeof JOB_SORTS)[number]
export type Level = (typeof LEVELS)[number]
export type Workplace = (typeof WORKPLACES)[number]
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export interface Job {
  id: string
  title: string
  company: string
  location: string
  workplace: Workplace
  level: Level
  employmentType: EmploymentType
  salaryMin: number | null
  salaryMax: number | null
  currency: string
  technologies: string[]
  description: string
  // True when the source only gave a snippet: the full description is on the original posting
  descriptionIsSnippet: boolean
  // When the job was posted, or when CodeHired first saw it if the source has no date
  createdAt: string
  // The posting date the source gave, when it gave one
  postedAt: string | null
  // The application deadline the source gave (USAJobs), when it gave one
  closesAt: string | null
  // Where the job was found, with a link to the original posting; null for jobs created here.
  // Showing it is what the sources' terms ask for (docs/data-sources.md).
  source: JobSource | null
  // The company's page on CodeHired. `company` stays the name as the posting wrote it; this is
  // the company it was matched to ("Acme, Inc." → Acme). Null until the job is linked.
  companyProfile: CompanyRef | null
}

export interface CompanyRef {
  id: number
  name: string
  // /companies/{slug}
  slug: string
  logoUrl: string | null
}

// GET /companies and GET /companies/:slug
export interface Company extends CompanyRef {
  website: string | null
  // The ATS CodeHired reads the company's own board on ('greenhouse', 'lever', 'ashby', 'smartrecruiters'), if any
  ats: string | null
  // Listed jobs, counted like GET /jobs counts them
  openJobs: number
}

export interface CompanyFilters {
  limit: number
  offset: number
}

// One place a job is posted
export interface JobSource {
  // `jobs.source`, e.g. 'greenhouse'
  id: string
  // Who to credit: "Greenhouse", "Remote OK"
  name: string
  // The site that published the job, when the source collects it from others (JSearch → "LinkedIn")
  publisher: string | null
  // The original posting, where candidates read the full job and apply
  url: string
  // A label the source's terms require next to each of its jobs, linked to the source
  credit: { text: string, url: string } | null
}

// GET /jobs/:id adds the formatted description and the other places the same opening was found
export interface JobDetail extends Job {
  // The source's description as sanitized HTML (paragraphs, lists, headings, emphasis, links),
  // safe to insert into the page as is. Null when the source gave plain text only: use `description`
  descriptionHtml: string | null
  alsoPostedOn: JobSource[]
}

// GET /sources: every data source and when its jobs were last refreshed
export interface SourceSummary {
  id: string
  name: string
  url: string
  termsUrl: string | null
  // When the last successful ingestion run of this source finished
  updatedAt: string | null
}

export interface JobFilters {
  text?: string
  technology?: string
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

export const USER_ROLES = ['candidate', 'employer'] as const
export type UserRole = (typeof USER_ROLES)[number]

// A signed-in user, as the auth routes return it. The password hash never leaves the model.
export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  createdAt: string
}

// GET /me/saved-jobs: a job the signed-in user saved
export interface SavedJob extends Job {
  savedAt: string
  // False once the job closed or its application deadline passed. Saved jobs stay listed until
  // ingestion deletes the job (60 days after it closed).
  open: boolean
}

// Where an application stands, from "thinking about it" to how it ended
export const APPLICATION_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

// /me/applications: an application the signed-in user tracks, to a CodeHired job or to a job
// found elsewhere and added by hand
export interface Application {
  id: number
  // The CodeHired job, or null for a manual entry (and once ingestion deleted the job)
  jobId: string | null
  company: string
  title: string
  // The posting, where they applied
  url: string | null
  // Where they applied: "LinkedIn", "Greenhouse", "Company site"...
  source: string | null
  status: ApplicationStatus
  notes: string
  // Calendar dates, YYYY-MM-DD
  appliedAt: string | null
  followUpAt: string | null
  // Whether the CodeHired job is still open; null for a manual entry
  open: boolean | null
  createdAt: string
  updatedAt: string
}

export interface Paginated<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
