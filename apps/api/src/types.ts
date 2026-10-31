export const LEVELS = ['intern', 'junior', 'mid', 'senior', 'staff', 'lead'] as const
export const WORKPLACES = ['remote', 'hybrid', 'onsite'] as const
export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship'] as const

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
  createdAt: string
  // Where the job was found, with a link to the original posting; null for jobs created here.
  // Showing it is what the sources' terms ask for (docs/data-sources.md).
  source: { name: string, url: string } | null
}

export interface JobFilters {
  text?: string
  technology?: string
  level?: Level
  workplace?: Workplace
  limit: number
  offset: number
}

export interface Paginated<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
