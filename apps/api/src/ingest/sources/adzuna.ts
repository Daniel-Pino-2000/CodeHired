// Adzuna: US IT jobs aggregated from thousands of job sites, through its search API with a free key:
// https://developer.adzuna.com/docs/search
// Terms (https://developer.adzuna.com/docs/terms_of_service): publishing Adzuna listings is a
// permitted use; every advert shown must be labelled "Adzuna" (at least 116 x 23 px) with a link to
// adzuna.com; no resale, no lead generation, never contact the advertisers. The API returns only a
// snippet of the description, so candidates read the rest and apply on `redirect_url`.
// See docs/data-sources.md.
import { createCallBudget, type BudgetLimits, type CallBudget } from '../budget.js'
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isTechRole, parseUsLocation, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

// The fields CodeHired reads from one job of GET /v1/api/jobs/us/search/{page}
export interface AdzunaJob {
  id: string | number
  // May hold <strong> highlights and HTML entities
  title: string
  // A snippet of the description, not the whole text
  description?: string | null
  created?: string | null
  // Adzuna's landing page for the ad, which leads to the original posting
  redirect_url: string
  company?: { display_name?: string | null } | null
  // `area` goes from the country down: ["US", "Texas", "Travis County", "Austin"]
  location?: { display_name?: string | null, area?: string[] | null } | null
  salary_min?: number | null
  salary_max?: number | null
  // "1" when the salary is Adzuna's own estimate, not the employer's
  salary_is_predicted?: string | number | null
  // "full_time" | "part_time"
  contract_time?: string | null
  // "permanent" | "contract"
  contract_type?: string | null
  category?: { tag?: string | null } | null
}

interface AdzunaPage {
  count?: number
  results?: unknown
}

export const ADZUNA_ENV = ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'] as const

// Adzuna's default limits are 25 calls a minute, 250 a day, 1,000 a week and 2,500 a month. We
// plan for about 80 a day and keep headroom on every period.
export const ADZUNA_BUDGET: BudgetLimits = { day: 80, week: 900, month: 2400 }
// 25 a minute: one call every 3 seconds stays well below
export const ADZUNA_MIN_INTERVAL_MS = 3000
export const ADZUNA_RESULTS_PER_PAGE = 50
// The schedule runs every 6 hours, so 4 runs a day of up to 20 calls each fit the daily budget
export const ADZUNA_MAX_PAGES = 20

export function adzunaUrl (page: number, { appId, appKey }: { appId: string, appKey: string }) {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    category: 'it-jobs',
    results_per_page: String(ADZUNA_RESULTS_PER_PAGE),
    max_days_old: '2',
    sort_by: 'date',
    'content-type': 'application/json'
  })
  return `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params}`
}

// Error messages name the URL, which holds the key: never let it reach a log
export function redactAdzunaKey (text: string) {
  return text.replace(/(app_(?:id|key)=)[^&\s]+/g, '$1***')
}

const plain = (html: string | null | undefined) => html ? htmlToText(html) : ''

function adzunaPlace (job: AdzunaJob, title: string): UsPlace | null {
  const area = job.location?.area ?? []
  if (area.length > 0 && area[0] !== 'US') return null
  const remote = /\bremote\b/i.test(title)
  const [, state, , city] = area
  if (!state) return { city: null, state: null, country: 'US', remote }
  const place = parseUsLocation(city ? `${city}, ${state}` : state, { assumeUs: true })
  return place ? { ...place, remote } : { city: null, state: null, country: 'US', remote }
}

export function keepAdzunaJob (job: AdzunaJob) {
  return isTechRole({ title: plain(job.title) }) && adzunaPlace(job, plain(job.title)) !== null
}

function adzunaEmploymentType (job: AdzunaJob, title: string) {
  if (job.contract_time === 'part_time') return 'part-time'
  if (job.contract_type === 'contract') return 'contract'
  return inferEmploymentType(title)
}

export function normalizeAdzunaJob (job: AdzunaJob): NormalizedJobInput {
  const title = plain(job.title)
  const place = adzunaPlace(job, title)
  if (!place) throw new Error('not in the US')
  // Adzuna's own estimates are not the employer's numbers (and would need "Adzuna Jobsworth" credit)
  const predicted = String(job.salary_is_predicted ?? '0') === '1'
  const salary = predicted ? usdYearlySalary(null, null) : usdYearlySalary(job.salary_min, job.salary_max)

  return {
    sourceId: String(job.id),
    sourceUrl: job.redirect_url,
    publisher: null,
    title,
    company: plain(job.company?.display_name),
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote: place.remote,
    workplace: place.remote ? 'remote' : 'onsite',
    level: inferLevel(title),
    employmentType: adzunaEmploymentType(job, title),
    ...salary,
    technologies: [],
    description: plain(job.description),
    descriptionHtml: null,
    postedAt: job.created ?? null
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface AdzunaOptions {
  http?: HttpClient
  env?: NodeJS.ProcessEnv
  // Defaults to the `api_usage` table with ADZUNA_BUDGET
  budget?: CallBudget
  maxPages?: number
  minIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function createAdzunaSource ({
  http = createHttpClient({ concurrency: 1 }),
  env = process.env,
  budget,
  maxPages = ADZUNA_MAX_PAGES,
  minIntervalMs = ADZUNA_MIN_INTERVAL_MS,
  sleep = wait
}: AdzunaOptions = {}): Source<AdzunaJob> {
  return {
    id: 'adzuna',
    name: 'Adzuna',
    attribution: {
      label: 'Adzuna',
      url: 'https://www.adzuna.com',
      termsUrl: 'https://developer.adzuna.com/docs/terms_of_service',
      credit: { text: 'Jobs by Adzuna', url: 'https://www.adzuna.com' }
    },
    priority: SOURCE_PRIORITY.adzuna,
    snippetOnly: true,
    seesOnlyRecentJobs: true,
    requiredEnv: ADZUNA_ENV,
    async * fetchJobs ({ logger }) {
      const appId = env.ADZUNA_APP_ID?.trim()
      const appKey = env.ADZUNA_APP_KEY?.trim()
      if (!appId || !appKey) throw new Error(`set ${ADZUNA_ENV.join(' and ')}`)
      const calls = budget ?? createCallBudget('adzuna', ADZUNA_BUDGET)

      let total = 0
      let kept = 0
      for (let page = 1; page <= maxPages; page++) {
        if (!await calls.take()) {
          logger.warn(`[adzuna] call budget reached, stopping at page ${page}`)
          break
        }
        if (page > 1) await sleep(minIntervalMs)

        let body: AdzunaPage
        try {
          body = await http.getJson<AdzunaPage>(adzunaUrl(page, { appId, appKey }))
        } catch (error) {
          throw new Error(redactAdzunaKey((error as Error).message))
        }
        if (!Array.isArray(body?.results)) throw new Error('unexpected response: results is not a list')

        for (const job of body.results as AdzunaJob[]) {
          total++
          if (!keepAdzunaJob(job)) continue
          kept++
          yield job
        }
        if (body.results.length < ADZUNA_RESULTS_PER_PAGE) break
      }
      logger.info(`[adzuna] kept ${kept} of ${total} jobs, ${await calls.remaining()} calls left in the budget`)
    },
    normalize: normalizeAdzunaJob
  }
}
