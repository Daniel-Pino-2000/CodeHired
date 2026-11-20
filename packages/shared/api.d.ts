// The API's contract: what its routes answer with, shared by the API (which builds these) and the
// web app (which reads them), so a change on one side that the other doesn't follow fails to
// compile. Types only: the lists of allowed values live in apps/api/src/types.ts, which checks
// that each list names every member of its type here.

export type Level = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'lead'
export type Workplace = 'remote' | 'hybrid' | 'onsite'
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship'
// GET /jobs `postedWithin`
export type PostedWithin = '24h' | '3d' | '7d' | '30d'
// GET /jobs `sort`
export type JobSort = 'newest' | 'salary_desc'
export type UserRole = 'candidate' | 'employer'
// Where an application stands, from "thinking about it" to how it ended
export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn'

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
  credit: SourceCreditLabel | null
}

export interface SourceCreditLabel {
  text: string
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

export interface SourcesResponse {
  // The latest successful run of any source
  updatedAt: string | null
  data: SourceSummary[]
}

// A signed-in user, as the auth routes return it. The password hash never leaves the model.
export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  createdAt: string
}

// POST /auth/register, POST /auth/login and GET /auth/me
export interface AuthResponse {
  user: User
}

// GET /me/saved-jobs: a job the signed-in user saved
export interface SavedJob extends Job {
  savedAt: string
  // False once the job closed or its application deadline passed. Saved jobs stay listed until
  // ingestion deletes the job (60 days after it closed).
  open: boolean
}

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

// GET /jobs and GET /companies: one page of the results
export interface Paginated<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// GET /me/saved-jobs and GET /me/applications: the whole list
export interface ListResponse<T> {
  data: T[]
  total: number
}

// /me/profile: what a candidate tells employers and "Jobs for you" about themselves. Every field
// is optional; a user who never saved one gets the empty profile, with `updatedAt` null.
export interface Profile {
  headline: string | null
  location: string | null
  bio: string
  // Technology slugs (packages/shared/technologies.json), in the order the candidate listed them
  skills: string[]
  yearsOfExperience: number | null
  desiredLevel: Level | null
  desiredWorkplace: Workplace | null
  links: ProfileLinks
  // A link to their resume (Google Drive, Dropbox, a personal site)
  resumeUrl: string | null
  updatedAt: string | null
}

export interface ProfileLinks {
  github: string | null
  linkedin: string | null
  portfolio: string | null
}

// Every error answer. A 400 adds the field errors (`{ email: ['Invalid email address'] }`); the
// profile names nested fields by path (`links.github`).
export interface ApiErrorBody {
  error: string
  details?: Record<string, string[]>
}
