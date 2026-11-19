// Jooble: a job search engine with a free REST API for sites that show its results "in your own
// design" (https://jooble.org/api/about). The key is issued per country site; a jooble.org key
// returns US jobs only. Docs: https://jooblehelpcenter.freshdesk.com/en/support/solutions/articles/60001448238
// The free plan is 100 requests a day, a hard limit (429 once reached), so every call goes through
// a budget kept in `api_usage`. See docs/data-sources.md.
import { createCallBudget, type BudgetLimits, type CallBudget } from '../budget.js'
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isNonUsPlace, isTechRole, parseUsLocation, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, inferWorkplace, refineWorkplace, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

// One job of the response's `jobs`
export interface JoobleJob {
  // A 64-bit number that JSON.parse rounds: the id is read from `link` instead
  id?: number | string | null
  title: string
  // "New York, NY", "Remote", "United States"
  location?: string | null
  // The start of the description, with <b> around the search terms
  snippet?: string | null
  // Free text: "$120k - $150k", "$95,000 - $120,000 a year", "$40 - $55 per hour"
  salary?: string | null
  // The site the posting comes from
  source?: string | null
  // "Full-time", "Part-time", "Contract"...
  type?: string | null
  // The job's page on Jooble, which sends candidates on to the posting
  link: string
  company?: string | null
  // Last update, ISO 8601 without an offset (UTC): "2026-11-18T00:00:00.0000000"
  updated?: string | null
}

interface JoobleResponse {
  totalCount?: number
  jobs?: unknown
}

// A repository secret: the key Jooble emails after the form at jooble.org/api/about
export const JOOBLE_ENV = ['JOOBLE_API_KEY'] as const

// The free plan allows 100 requests a day. We use 20, once a day, and cap the month too.
export const JOOBLE_BUDGET: BudgetLimits = { day: 20, month: 600 }
export const JOOBLE_DAILY_PLAN_LIMIT = 100

export const JOOBLE_RESULTS_PER_PAGE = 50
export const JOOBLE_PAGES_PER_QUERY = 2
export const JOOBLE_MIN_HOURS_BETWEEN_RUNS = 20

// 8 queries of up to 2 pages: 16 requests a run at most, within the daily budget
export const JOOBLE_QUERIES = [
  'software engineer',
  'frontend developer',
  'backend developer',
  'full stack developer',
  'data engineer',
  'devops engineer',
  'machine learning engineer',
  'mobile developer'
] as const

export const joobleUrl = (key: string) => `https://jooble.org/api/${encodeURIComponent(key)}`

// The body of one search. An empty location searches the whole country of the key (the US).
export function joobleSearch (keywords: string, page: number) {
  return { keywords, location: '', page: String(page), ResultOnPage: String(JOOBLE_RESULTS_PER_PAGE) }
}

// Error messages name the URL, which holds the key: never let it reach a log
export function redactJoobleKey (text: string, key: string) {
  return text.split(encodeURIComponent(key)).join('***').split(key).join('***')
}

const plain = (html: string | null | undefined) => html ? htmlToText(html) : ''

// The job's id, from its link: jooble.org/desc/-1234567890123456789?ckey=...
export function joobleJobId (job: JoobleJob) {
  const match = /\/desc\/(-?\d+)/.exec(job.link ?? '')
  if (match) return match[1]
  const id = job.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

// Every job of a jooble.org key is in the US, so a location without a state is still in the US
function jooblePlace (job: JoobleJob, title: string): UsPlace | null {
  const location = plain(job.location)
  if (isNonUsPlace(location)) return null
  const remote = /\bremote\b/i.test(`${location} ${title}`)
  const place = parseUsLocation(location, { assumeUs: true })
  return place ? { ...place, remote: place.remote || remote } : { city: null, state: null, country: 'US', remote }
}

export function keepJoobleJob (job: JoobleJob) {
  const title = plain(job.title)
  return !!job.link && isTechRole({ title }) && jooblePlace(job, title) !== null
}

// A yearly range in dollars, from a free-text salary. Hourly, weekly or monthly rates are dropped.
export function parseJoobleSalary (text: string | null | undefined) {
  const salary = text?.trim() ?? ''
  if (!salary || /\b(hour|hr|hourly|day|daily|week|weekly|month|monthly)\b/i.test(salary)) return usdYearlySalary(null, null)
  if (/[€£₹]|\b(EUR|GBP|CAD|INR|AUD)\b/i.test(salary)) return usdYearlySalary(null, null)
  const amounts = [...salary.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi)]
    .map(([, number, thousands]) => Number(number.replace(/,/g, '')) * (thousands ? 1000 : 1))
  const [min = null, max = null] = amounts
  return usdYearlySalary(min, max ?? min)
}

// "2026-11-18T00:00:00.0000000" is UTC without saying so
function isoDate (text: string | null | undefined) {
  if (!text) return null
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeJoobleJob (job: JoobleJob): NormalizedJobInput {
  const title = plain(job.title)
  const place = jooblePlace(job, title)
  if (!place) throw new Error('not in the US')
  const id = joobleJobId(job)
  if (!id) throw new Error('no job id in the link')
  const description = plain(job.snippet)

  return {
    sourceId: id,
    sourceUrl: job.link,
    // The link goes to Jooble, so the job is shown as found on Jooble, not on the site it came from
    publisher: null,
    title,
    company: plain(job.company),
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote: place.remote,
    workplace: refineWorkplace(inferWorkplace({ remote: place.remote, text: `${job.location ?? ''} ${title}` }), description),
    level: inferLevel(title),
    employmentType: inferEmploymentType(`${job.type ?? ''} ${title}`),
    ...parseJoobleSalary(job.salary),
    technologies: [],
    description,
    descriptionHtml: null,
    postedAt: isoDate(job.updated)
  }
}

export interface JoobleOptions {
  // Retries would spend requests the budget never counted, so the default client makes none
  http?: HttpClient
  env?: NodeJS.ProcessEnv
  // Defaults to the `api_usage` table with JOOBLE_BUDGET
  budget?: CallBudget
  queries?: readonly string[]
  pagesPerQuery?: number
  now?: () => Date
}

export function createJoobleSource ({
  http = createHttpClient({ concurrency: 1, retries: 0 }),
  env = process.env,
  budget,
  queries = JOOBLE_QUERIES,
  pagesPerQuery = JOOBLE_PAGES_PER_QUERY,
  now = () => new Date()
}: JoobleOptions = {}): Source<JoobleJob> {
  return {
    id: 'jooble',
    name: 'Jooble',
    attribution: {
      label: 'Jooble',
      url: 'https://jooble.org',
      termsUrl: 'https://jooble.org/api/about'
    },
    priority: SOURCE_PRIORITY.jooble,
    snippetOnly: true,
    seesOnlyRecentJobs: true,
    requiredEnv: JOOBLE_ENV,
    minHoursBetweenRuns: JOOBLE_MIN_HOURS_BETWEEN_RUNS,
    async * fetchJobs ({ logger }) {
      const key = env.JOOBLE_API_KEY?.trim()
      if (!key) throw new Error(`set ${JOOBLE_ENV.join(' and ')}`)
      const calls = budget ?? createCallBudget('jooble', JOOBLE_BUDGET, { now })

      const seen = new Set<string>()
      let total = 0
      let kept = 0
      let budgetReached = false
      for (const query of queries) {
        for (let page = 1; page <= pagesPerQuery; page++) {
          if (!await calls.take()) {
            logger.warn(`[jooble] call budget reached, skipping "${query}" page ${page} and the searches after it`)
            budgetReached = true
            break
          }

          let body: JoobleResponse
          try {
            body = await http.postJson<JoobleResponse>(joobleUrl(key), joobleSearch(query, page))
          } catch (error) {
            throw new Error(redactJoobleKey((error as Error).message, key))
          }
          if (!Array.isArray(body?.jobs)) throw new Error(`unexpected response for "${query}": jobs is not a list`)

          for (const job of body.jobs as JoobleJob[]) {
            total++
            const id = job ? joobleJobId(job) : null
            // The same posting often answers several queries
            if (!id || seen.has(id) || !keepJoobleJob(job)) continue
            seen.add(id)
            kept++
            yield job
          }
          if (body.jobs.length < JOOBLE_RESULTS_PER_PAGE) break
        }
        if (budgetReached) break
      }
      logger.info(`[jooble] kept ${kept} of ${total} jobs, ${await calls.remaining()} calls left in the budget`)
    },
    normalize: normalizeJoobleJob
  }
}
