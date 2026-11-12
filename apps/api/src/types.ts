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
  // Where the job was found, with a link to the original posting; null for jobs created here.
  // Showing it is what the sources' terms ask for (docs/data-sources.md).
  source: JobSource | null
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
  sort?: JobSort
  limit: number
  offset: number
}

export interface Paginated<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
