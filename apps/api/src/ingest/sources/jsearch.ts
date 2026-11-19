// JSearch: Google for Jobs results through OpenWeb Ninja's API, which is how CodeHired shows
// listings published on LinkedIn, Indeed, ZipRecruiter, Glassdoor and others without scraping them:
// https://www.openwebninja.com/api/jsearch. We only ever call api.openwebninja.com, never those sites.
// Terms (https://www.openwebninja.com/terms, section 2): the API data may be used in our own
// products, but not resold as a standalone data feed or API; we answer for following the terms of
// the site each job comes from. The free plan is a hard 200 requests a month, so every call goes
// through a budget kept in `api_usage`. See docs/data-sources.md.
import { createCallBudget, type BudgetLimits, type CallBudget } from '../budget.js'
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isTechRole, isUsCountry, parseUsLocation, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, inferWorkplace, refineWorkplace, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'
import type { EmploymentType } from '../../types.js'

// The fields CodeHired reads from one job of GET /jsearch/search-v2
export interface JSearchJob {
  job_id: string
  job_title: string
  employer_name?: string | null
  // The site that published the posting: "LinkedIn", "Indeed", "ZipRecruiter", "Acme Careers"...
  job_publisher?: string | null
  // Where candidates apply: the posting on the publisher's site
  job_apply_link: string
  // "FULLTIME" | "CONTRACTOR" | "PARTTIME" | "INTERN"
  job_employment_types?: string[] | null
  // A label such as "Full-time"
  job_employment_type?: string | null
  // Plain text, sometimes cut short
  job_description?: string | null
  job_highlights?: Record<string, string[] | null | undefined> | null
  job_is_remote?: boolean | null
  job_posted_at_datetime_utc?: string | null
  job_posted_at_timestamp?: number | null
  job_location?: string | null
  job_city?: string | null
  // A state's name or its code: "Illinois", "IL"
  job_state?: string | null
  job_country?: string | null
  job_min_salary?: number | null
  job_max_salary?: number | null
  // "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR"
  job_salary_period?: string | null
  // When Google says the offer expires. Not always present (the newer search-v2 schema leaves it out)
  job_offer_expiration_datetime_utc?: string | null
  job_offer_expiration_timestamp?: number | null
}

interface JSearchResponse {
  status?: string
  error?: unknown
  data?: { jobs?: unknown, cursor?: string | null } | null
}

// A repository secret: the key from app.openwebninja.com (free plan)
export const JSEARCH_ENV = ['JSEARCH_API_KEY'] as const

// The free plan allows 200 requests a month and then refuses. We stop at 190 to keep headroom, and
// spread them out: 6 a day is at most 186 in a 31-day month.
export const JSEARCH_BUDGET: BudgetLimits = { day: 6, month: 190 }
export const JSEARCH_MONTHLY_PLAN_LIMIT = 200

// Each request returns one page of up to 10 jobs and costs one credit
export const JSEARCH_RESULTS_PER_PAGE = 10
// One run a day uses the whole daily budget, one query per call
export const JSEARCH_QUERIES_PER_RUN = 6
export const JSEARCH_MIN_HOURS_BETWEEN_RUNS = 20

// Rotated day by day, so every role is searched every couple of days
export const JSEARCH_QUERIES = [
  'software engineer',
  'frontend developer',
  'backend developer',
  'data engineer',
  'devops engineer',
  'full stack developer',
  'machine learning engineer',
  'mobile developer'
] as const

const DAY_MS = 86_400_000

// The queries of the UTC day `date`: a window of `count` that moves on by `count` every day
export function jsearchQueriesFor (date: Date, queries: readonly string[] = JSEARCH_QUERIES, count = JSEARCH_QUERIES_PER_RUN) {
  if (queries.length === 0) return []
  const day = Math.floor(date.getTime() / DAY_MS)
  const start = (day * count) % queries.length
  return Array.from({ length: Math.min(count, queries.length) }, (_, index) => queries[(start + index) % queries.length])
}

export function jsearchUrl (query: string) {
  const params = new URLSearchParams({
    query: `${query} jobs in the United States`,
    num_pages: '1',
    country: 'us',
    date_posted: 'today'
  })
  return `https://api.openwebninja.com/jsearch/search-v2?${params}`
}

const plain = (text: string | null | undefined) => text ? htmlToText(text) : ''

function jsearchPlace (job: JSearchJob): UsPlace | null {
  if (job.job_country && !isUsCountry(job.job_country)) return null
  const remote = job.job_is_remote === true
  const city = job.job_city?.trim()
  const state = job.job_state?.trim()
  const text = city && state ? `${city}, ${state}` : state || job.job_location
  const place = parseUsLocation(text, { assumeUs: isUsCountry(job.job_country) })
  if (place) return { ...place, remote }
  // "United States" with no city, or a remote job open across the US
  return isUsCountry(job.job_country) ? { city: null, state: null, country: 'US', remote } : null
}

export function keepJSearchJob (job: JSearchJob) {
  return isTechRole({ title: plain(job.job_title) }) && jsearchPlace(job) !== null
}

const EMPLOYMENT_TYPES: Record<string, EmploymentType> = {
  FULLTIME: 'full-time',
  PARTTIME: 'part-time',
  CONTRACTOR: 'contract',
  INTERN: 'internship'
}

function jsearchEmploymentType (job: JSearchJob, title: string): EmploymentType {
  if (/\bintern(ship)?\b/i.test(title)) return 'internship'
  const first = job.job_employment_types?.map((type) => EMPLOYMENT_TYPES[type.trim().toUpperCase()]).find(Boolean)
  return first ?? inferEmploymentType(`${job.job_employment_type ?? ''} ${title}`)
}

// The description, or the highlights Google extracted when there is none
function jsearchDescription (job: JSearchJob) {
  const description = plain(job.job_description)
  if (description) return description
  return Object.entries(job.job_highlights ?? {})
    .filter(([, items]) => Array.isArray(items) && items.length > 0)
    .map(([heading, items]) => `${heading}\n${items!.map((item) => `- ${plain(item)}`).join('\n')}`)
    .join('\n\n')
}

// An ISO date-time, or seconds since the epoch, as ISO 8601; null for anything else
function isoDate (text: string | null | undefined, seconds: number | null | undefined) {
  const date = text ? new Date(text) : typeof seconds === 'number' ? new Date(seconds * 1000) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

export function normalizeJSearchJob (job: JSearchJob): NormalizedJobInput {
  const title = plain(job.job_title)
  const place = jsearchPlace(job)
  if (!place) throw new Error('not in the US')
  const description = jsearchDescription(job)
  const salary = job.job_salary_period?.trim().toUpperCase() === 'YEAR'
    ? usdYearlySalary(job.job_min_salary, job.job_max_salary)
    : usdYearlySalary(null, null)

  return {
    sourceId: job.job_id,
    sourceUrl: job.job_apply_link,
    // Shown as "via LinkedIn": the listing's own site, not JSearch
    publisher: plain(job.job_publisher) || null,
    title,
    company: plain(job.employer_name),
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote: place.remote,
    workplace: refineWorkplace(inferWorkplace({ remote: place.remote, text: title }), description),
    level: inferLevel(title),
    employmentType: jsearchEmploymentType(job, title),
    ...salary,
    technologies: [],
    description,
    descriptionHtml: null,
    postedAt: isoDate(job.job_posted_at_datetime_utc, job.job_posted_at_timestamp),
    closesAt: isoDate(job.job_offer_expiration_datetime_utc, job.job_offer_expiration_timestamp)
  }
}

export interface JSearchOptions {
  // Retries would spend credits the budget never counted, so the default client makes none
  http?: HttpClient
  env?: NodeJS.ProcessEnv
  // Defaults to the `api_usage` table with JSEARCH_BUDGET
  budget?: CallBudget
  queries?: readonly string[]
  queriesPerRun?: number
  now?: () => Date
}

export function createJSearchSource ({
  http = createHttpClient({ concurrency: 1, retries: 0 }),
  env = process.env,
  budget,
  queries = JSEARCH_QUERIES,
  queriesPerRun = JSEARCH_QUERIES_PER_RUN,
  now = () => new Date()
}: JSearchOptions = {}): Source<JSearchJob> {
  return {
    id: 'jsearch',
    name: 'JSearch',
    attribution: {
      label: 'JSearch',
      url: 'https://www.openwebninja.com/api/jsearch',
      termsUrl: 'https://www.openwebninja.com/terms'
    },
    priority: SOURCE_PRIORITY.jsearch,
    snippetOnly: true,
    seesOnlyRecentJobs: true,
    requiredEnv: JSEARCH_ENV,
    minHoursBetweenRuns: JSEARCH_MIN_HOURS_BETWEEN_RUNS,
    async * fetchJobs ({ logger }) {
      const key = env.JSEARCH_API_KEY?.trim()
      if (!key) throw new Error(`set ${JSEARCH_ENV.join(' and ')}`)
      const calls = budget ?? createCallBudget('jsearch', JSEARCH_BUDGET, { now })

      const seen = new Set<string>()
      let total = 0
      let kept = 0
      for (const query of jsearchQueriesFor(now(), queries, queriesPerRun)) {
        if (!await calls.take()) {
          logger.warn(`[jsearch] call budget reached, skipping "${query}" and the queries after it`)
          break
        }
        // The key travels in a header, never in the URL that error messages show
        const body = await http.getJson<JSearchResponse>(jsearchUrl(query), { 'x-api-key': key })
        const jobs = body?.data?.jobs
        if (body?.status !== 'OK' || !Array.isArray(jobs)) {
          throw new Error(`unexpected response for "${query}": status ${String(body?.status)}`)
        }

        for (const job of jobs as JSearchJob[]) {
          total++
          // The same posting often answers several queries
          if (!job?.job_id || seen.has(job.job_id) || !keepJSearchJob(job)) continue
          seen.add(job.job_id)
          kept++
          yield job
        }
      }
      logger.info(`[jsearch] kept ${kept} of ${total} jobs, ${await calls.remaining()} calls left in the budget`)
    },
    normalize: normalizeJSearchJob
  }
}
