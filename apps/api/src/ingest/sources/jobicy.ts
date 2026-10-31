// Jobicy: remote jobs from its public API, no key: https://jobicy.com/jobs-rss-feed
// Terms: credit Jobicy as the source, keep apply links pointing to the job's page on Jobicy, never
// present its listings as our own. Sync at most once an hour. See docs/data-sources.md.
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isTechRole, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

// The fields CodeHired reads from one job of GET /api/jobs
export interface JobicyJob {
  id: number
  // The job's page on Jobicy, where candidates apply
  url: string
  jobTitle: string
  companyName: string
  jobIndustry?: string[] | null
  jobType?: string[] | null
  // Where applicants may live: "USA", "Canada,  USA", "Anywhere"...
  jobGeo?: string | null
  // HTML
  jobDescription?: string | null
  pubDate?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  salaryPeriod?: string | null
}

// Jobicy keeps the last 7 days of jobs; at most 100 a page
export const JOBICY_MAX_PAGES = 10

export const jobicyUrl = (cursor?: string) =>
  `https://jobicy.com/api/jobs?${new URLSearchParams({ count: '100', geo: 'usa', ...(cursor ? { cursor } : {}) })}`

function jobicyPlace (job: JobicyJob): UsPlace | null {
  const regions = (job.jobGeo ?? '').split(',').map((region) => region.trim().toLowerCase()).filter(Boolean)
  if (regions.includes('usa') || regions.includes('united states')) return { city: null, state: null, country: 'US', remote: true }
  if (regions.length === 0 || regions.includes('anywhere')) return { city: null, state: null, country: null, remote: true }
  return null
}

export function keepJobicyJob (job: JobicyJob) {
  return isTechRole({ title: job.jobTitle, departments: job.jobIndustry ?? [] }) && jobicyPlace(job) !== null
}

export function normalizeJobicyJob (job: JobicyJob): NormalizedJobInput {
  const place = jobicyPlace(job)
  if (!place) throw new Error('not open to US-based applicants')
  const descriptionHtml = job.jobDescription?.trim() || null
  const salary = job.salaryPeriod === 'yearly'
    ? usdYearlySalary(job.salaryMin, job.salaryMax, job.salaryCurrency)
    : usdYearlySalary(null, null)

  return {
    sourceId: String(job.id),
    sourceUrl: job.url,
    publisher: null,
    title: job.jobTitle,
    company: job.companyName,
    location: formatUsLocation(place),
    city: null,
    state: null,
    country: place.country,
    remote: true,
    workplace: 'remote',
    level: inferLevel(job.jobTitle),
    employmentType: inferEmploymentType(`${(job.jobType ?? []).join(' ')} ${job.jobTitle}`),
    ...salary,
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: job.pubDate ?? null
  }
}

interface JobicyPage {
  jobs?: unknown
  hasMore?: boolean
  nextCursor?: string | null
}

export function createJobicySource ({ http = createHttpClient({ concurrency: 1 }), maxPages = JOBICY_MAX_PAGES }: { http?: HttpClient, maxPages?: number } = {}): Source<JobicyJob> {
  return {
    id: 'jobicy',
    name: 'Jobicy',
    attribution: { label: 'Jobicy', url: 'https://jobicy.com' },
    priority: SOURCE_PRIORITY.remoteBoard,
    async * fetchJobs ({ logger }) {
      let cursor: string | undefined
      let total = 0
      let kept = 0
      for (let page = 1; page <= maxPages; page++) {
        const body = await http.getJson<JobicyPage>(jobicyUrl(cursor))
        if (!Array.isArray(body?.jobs)) throw new Error('unexpected response: jobs is not a list')
        for (const job of body.jobs as JobicyJob[]) {
          total++
          if (!keepJobicyJob(job)) continue
          kept++
          yield job
        }
        if (!body.hasMore || !body.nextCursor) break
        cursor = body.nextCursor
      }
      logger.info(`[jobicy] kept ${kept} of ${total} jobs`)
    },
    normalize: normalizeJobicyJob
  }
}
