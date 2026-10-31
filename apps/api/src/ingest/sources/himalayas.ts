// Himalayas: remote jobs from its public API, no key: https://himalayas.app/api
// Terms (https://himalayas.app/terms, API section): name Himalayas as the source with a visible link,
// apply through `applicationLink` unchanged, show the jobs only on our own site, never pass them on
// (feeds, JobPosting structured data...), remove expired jobs. See docs/data-sources.md.
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isTechRole, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

// The fields CodeHired reads from one job of GET /jobs/api/search
export interface HimalayasJob {
  title: string
  companyName: string
  // The job's page on Himalayas: stable, so it is the job's id
  guid: string
  // The job's page with a tracking parameter: every Apply link must use it unchanged
  applicationLink: string
  employmentType?: string | null
  minSalary?: number | null
  maxSalary?: number | null
  salaryPeriod?: string | null
  currency?: string | null
  // Countries whose residents may apply; empty means anywhere
  locationRestrictions?: string[] | null
  parentCategories?: string[] | null
  // HTML
  description?: string | null
  // Seconds since the epoch
  pubDate?: number | null
  expiryDate?: number | null
}

// The search needs a query. These cover most software roles; the filters below do the rest.
export const HIMALAYAS_QUERIES = ['software engineer', 'developer', 'data engineer', 'devops', 'machine learning']
// About 20 jobs a page, newest first. The data refreshes daily, so the newest pages are what changed.
export const HIMALAYAS_PAGES_PER_QUERY = 5

export const himalayasSearchUrl = (query: string, page: number) =>
  `https://himalayas.app/jobs/api/search?${new URLSearchParams({ q: query, country: 'US', sort: 'recent', page: String(page) })}`

function himalayasPlace (job: HimalayasJob): UsPlace | null {
  const countries = job.locationRestrictions ?? []
  if (countries.length === 0) return { city: null, state: null, country: null, remote: true }
  return countries.includes('United States') ? { city: null, state: null, country: 'US', remote: true } : null
}

export function keepHimalayasJob (job: HimalayasJob, now = Date.now()) {
  const expired = typeof job.expiryDate === 'number' && job.expiryDate * 1000 < now
  return !expired &&
    isTechRole({ title: job.title, departments: job.parentCategories ?? [] }) &&
    himalayasPlace(job) !== null
}

export function normalizeHimalayasJob (job: HimalayasJob): NormalizedJobInput {
  const place = himalayasPlace(job)
  if (!place) throw new Error('not open to US-based applicants')
  const descriptionHtml = job.description?.trim() || null
  const salary = job.salaryPeriod === 'annual'
    ? usdYearlySalary(job.minSalary, job.maxSalary, job.currency ?? 'USD')
    : usdYearlySalary(null, null)

  return {
    sourceId: job.guid,
    sourceUrl: job.applicationLink,
    publisher: null,
    title: job.title,
    company: job.companyName,
    location: formatUsLocation(place),
    city: null,
    state: null,
    country: place.country,
    remote: true,
    workplace: 'remote',
    level: inferLevel(job.title),
    employmentType: inferEmploymentType(`${job.employmentType ?? ''} ${job.title}`),
    ...salary,
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: typeof job.pubDate === 'number' ? new Date(job.pubDate * 1000).toISOString() : null
  }
}

interface HimalayasOptions {
  // One request at a time: without a key, every caller shares one allowance
  http?: HttpClient
  queries?: readonly string[]
  pagesPerQuery?: number
}

export function createHimalayasSource ({
  http = createHttpClient({ concurrency: 1 }),
  queries = HIMALAYAS_QUERIES,
  pagesPerQuery = HIMALAYAS_PAGES_PER_QUERY
}: HimalayasOptions = {}): Source<HimalayasJob> {
  return {
    id: 'himalayas',
    name: 'Himalayas',
    attribution: { label: 'Himalayas', url: 'https://himalayas.app' },
    priority: SOURCE_PRIORITY.remoteBoard,
    async * fetchJobs ({ logger }) {
      // The same job comes up in several queries
      const seen = new Set<string>()
      let total = 0
      let kept = 0

      for (const query of queries) {
        for (let page = 1; page <= pagesPerQuery; page++) {
          const body = await http.getJson<{ jobs?: unknown }>(himalayasSearchUrl(query, page))
          if (!Array.isArray(body?.jobs)) throw new Error('unexpected response: jobs is not a list')
          const jobs = body.jobs as HimalayasJob[]
          // Pages can be short, so only an empty page means the end
          if (jobs.length === 0) break

          for (const job of jobs) {
            if (seen.has(job.guid)) continue
            seen.add(job.guid)
            total++
            if (!keepHimalayasJob(job)) continue
            kept++
            yield job
          }
        }
      }
      logger.info(`[himalayas] kept ${kept} of ${total} jobs`)
    },
    normalize: normalizeHimalayasJob
  }
}
