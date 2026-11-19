// USAJobs: every federal opening, published by the Office of Personnel Management (OPM) through
// its free Search API: https://developer.usajobs.gov/api-reference/get-api-search
// Terms (https://developer.usajobs.gov/guides/terms-of-service): the data is public and may be
// modified and redistributed. OPM asks apps to name USAJOBS as the source, link to the official
// announcement, and never imply that OPM or an agency endorses them. A key is free; every request
// sends it with the email it was issued to as `User-Agent`. See docs/data-sources.md.
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, parseUsLocation, type UsPlace } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { decodeEntities, htmlToText, inferEmploymentType, inferLevel, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'
import type { EmploymentType, Level, Workplace } from '../../types.js'

interface CodeName {
  Code?: string | null
  Name?: string | null
}

export interface UsaJobsLocation {
  LocationName?: string | null
  CountryCode?: string | null
  // The state's full name: "Virginia", "District of Columbia"
  CountrySubDivisionCode?: string | null
  CityName?: string | null
}

// The fields CodeHired reads from one `MatchedObjectDescriptor` of GET /api/search
export interface UsaJobsDescriptor {
  // The announcement number, shown on the posting
  PositionID?: string | null
  PositionTitle: string
  // The official announcement: https://www.usajobs.gov/job/123456789
  PositionURI: string
  PositionLocationDisplay?: string | null
  PositionLocation?: UsaJobsLocation[] | null
  OrganizationName?: string | null
  DepartmentName?: string | null
  JobCategory?: CodeName[] | null
  // The pay plan: "GS", "GG"...
  JobGrade?: CodeName[] | null
  // Code 1 Full-Time, 2 Part-Time, 3 Shift Work, 4 Intermittent, 5 Job Sharing, 6 Multiple Schedules
  PositionSchedule?: CodeName[] | null
  // "Permanent", "Term", "Temporary", "Internships"...
  PositionOfferingType?: CodeName[] | null
  QualificationSummary?: string | null
  PositionRemuneration?: Array<{
    MinimumRange?: string | number | null
    MaximumRange?: string | number | null
    // "PA" (per year), "PH" (per hour)...; newer responses may spell it out ("Per Year")
    RateIntervalCode?: string | null
    Description?: string | null
  }> | null
  // Eastern Time, without an offset: "2026-11-18T00:00:00.0000"
  PublicationStartDate?: string | null
  // Applications close at 11:59 PM Eastern Time on this day: "2026-12-02T23:59:59.9970"
  ApplicationCloseDate?: string | null
  UserArea?: {
    Details?: {
      JobSummary?: string | null
      MajorDuties?: string[] | string | null
      LowGrade?: string | null
      HighGrade?: string | null
      TeleworkEligible?: boolean | null
      RemoteIndicator?: boolean | null
    } | null
  } | null
}

export interface UsaJobsItem {
  // The control number: stable for the life of the announcement
  MatchedObjectId: string | number
  MatchedObjectDescriptor: UsaJobsDescriptor
}

interface UsaJobsPage {
  SearchResult?: {
    SearchResultCount?: number
    SearchResultCountAll?: number
    SearchResultItems?: unknown
    UserArea?: { NumberOfPages?: string | number | null } | null
  } | null
}

// Set as repository secrets: the key from developer.usajobs.gov, and the email it was issued to,
// which the API requires as `User-Agent`. The email lives only in the environment, never in code.
export const USAJOBS_ENV = ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'] as const

// 2210 is Information Technology Management, 1550 Computer Science
export const USAJOBS_CATEGORIES = ['2210', '1550'] as const
// The documented maximums: 500 rows a page, 10,000 rows a query
export const USAJOBS_RESULTS_PER_PAGE = 500
export const USAJOBS_MAX_PAGES = 20
// No rate limit is published; one request at a time with a pause in between keeps us a light client
export const USAJOBS_MIN_INTERVAL_MS = 1000

export function usaJobsUrl (page: number) {
  const params = new URLSearchParams({
    JobCategoryCode: USAJOBS_CATEGORIES.join(';'),
    ResultsPerPage: String(USAJOBS_RESULTS_PER_PAGE),
    Page: String(page),
    SortField: 'opendate',
    SortDirection: 'desc',
    Fields: 'Full'
  })
  return `https://data.usajobs.gov/api/search?${params}`
}

const NEW_YORK_OFFSET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })

// "GMT-05:00" → -300
function newYorkOffsetMinutes (instant: Date) {
  const name = NEW_YORK_OFFSET.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? ''
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!match) return -300
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
}

// USAJobs dates are Eastern Time without an offset. Returns the instant in ISO 8601 with `Z`, or
// null for anything else. A string that already has an offset is taken as it is.
export function easternTimeToIso (text: string | null | undefined) {
  if (!text) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(text.trim())
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00', second = '00', offset] = match
  if (offset) {
    const date = new Date(text.trim())
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  if (Number.isNaN(wallClock)) return null
  // The offset at the wall-clock time read as UTC is right except within hours of a DST switch;
  // checking again at the corrected instant settles those
  let instant = wallClock - newYorkOffsetMinutes(new Date(wallClock)) * 60_000
  instant = wallClock - newYorkOffsetMinutes(new Date(instant)) * 60_000
  return new Date(instant).toISOString()
}

const plain = (text: string | null | undefined) => text ? htmlToText(text) : ''

function escapeHtml (text: string) {
  return decodeEntities(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const isUs = (location: UsaJobsLocation) => /^(us|usa|united states( of america)?)$/i.test(location.CountryCode?.trim() ?? '')

const REMOTE_LOCATION = /\bremote\b|anywhere in the u\.?s/i

// The first US duty location. Remote jobs list "Anywhere in the U.S. (remote job)".
function usaJobsPlace (job: UsaJobsDescriptor): UsPlace | null {
  const locations = job.PositionLocation ?? []
  const remote = job.UserArea?.Details?.RemoteIndicator === true ||
    REMOTE_LOCATION.test(job.PositionLocationDisplay ?? '') ||
    locations.some((location) => REMOTE_LOCATION.test(location.LocationName ?? ''))
  const location = locations.find(isUs)
  if (!location) {
    // Overseas duty stations only. A remote job with no location data is still a US federal job.
    return remote && locations.length === 0 ? { city: null, state: null, country: 'US', remote } : null
  }
  if (REMOTE_LOCATION.test(location.LocationName ?? '')) return { city: null, state: null, country: 'US', remote: true }

  // `CityName` holds the state too: "Arlington, Virginia"
  const text = location.CityName || location.LocationName || location.CountrySubDivisionCode
  const place = parseUsLocation(text, { assumeUs: true }) ??
    parseUsLocation(location.CountrySubDivisionCode, { assumeUs: true })
  return place ? { ...place, remote } : { city: null, state: null, country: 'US', remote }
}

export function keepUsaJobsJob (item: UsaJobsItem) {
  return usaJobsPlace(item.MatchedObjectDescriptor) !== null
}

function yearlySalary (job: UsaJobsDescriptor) {
  const pay = job.PositionRemuneration?.find((range) => /^(pa|per year)$/i.test(range.RateIntervalCode?.trim() ?? ''))
  return usdYearlySalary(pay?.MinimumRange, pay?.MaximumRange)
}

function usaJobsEmploymentType (job: UsaJobsDescriptor, title: string): EmploymentType {
  const offering = (job.PositionOfferingType ?? []).map((type) => type.Name ?? '').join(' ')
  if (/\bintern(ship)?s?\b/i.test(`${offering} ${title}`)) return 'internship'
  if ((job.PositionSchedule ?? []).some((schedule) => schedule.Code === '2' || /part[- ]time/i.test(schedule.Name ?? ''))) {
    return 'part-time'
  }
  // Term and temporary appointments end on a set date
  if (/\b(term|temporary)\b/i.test(offering)) return 'contract'
  return inferEmploymentType(title)
}

// Federal titles rarely say "Senior": the General Schedule grade does. GS-7 and below are entry
// level, GS-9 to 11 mid, GS-12 and 13 senior, GS-14 and 15 staff. Other pay plans use the title.
function usaJobsLevel (job: UsaJobsDescriptor, title: string): Level {
  if (/\bsupervisory\b/i.test(title)) return 'lead'
  const fromTitle = inferLevel(title)
  if (fromTitle !== 'mid') return fromTitle
  const payPlan = job.JobGrade?.[0]?.Code?.trim().toUpperCase()
  const grade = Number(job.UserArea?.Details?.HighGrade ?? job.UserArea?.Details?.LowGrade)
  if (!payPlan || !['GS', 'GG', 'GL'].includes(payPlan) || !Number.isInteger(grade) || grade <= 0) return fromTitle
  if (grade <= 7) return 'junior'
  if (grade <= 11) return 'mid'
  if (grade <= 13) return 'senior'
  return 'staff'
}

function usaJobsWorkplace (job: UsaJobsDescriptor, place: UsPlace): Workplace {
  if (place.remote) return 'remote'
  // Telework-eligible federal jobs are on site some days and at home others
  return job.UserArea?.Details?.TeleworkEligible === true ? 'hybrid' : 'onsite'
}

// The summary, the duties and the qualifications, as the HTML the job page shows
function usaJobsDescriptionHtml (job: UsaJobsDescriptor) {
  const details = job.UserArea?.Details
  const duties = (Array.isArray(details?.MajorDuties) ? details.MajorDuties : [details?.MajorDuties])
    .filter((duty): duty is string => typeof duty === 'string' && duty.trim().length > 0)
  const parts: string[] = []
  if (details?.JobSummary?.trim()) parts.push(`<p>${escapeHtml(details.JobSummary.trim())}</p>`)
  if (duties.length > 0) {
    parts.push('<h3>Duties</h3>', `<ul>${duties.map((duty) => `<li>${escapeHtml(duty.trim())}</li>`).join('')}</ul>`)
  }
  if (job.QualificationSummary?.trim()) parts.push('<h3>Qualifications</h3>', `<p>${escapeHtml(job.QualificationSummary.trim())}</p>`)
  return parts.join('\n')
}

export function normalizeUsaJobsJob ({ MatchedObjectId: id, MatchedObjectDescriptor: job }: UsaJobsItem): NormalizedJobInput {
  const title = plain(job.PositionTitle)
  const place = usaJobsPlace(job)
  if (!place) throw new Error('not in the US')
  const descriptionHtml = usaJobsDescriptionHtml(job)

  return {
    sourceId: String(id),
    // `new URL` drops the `:443` the API sometimes writes into the link
    sourceUrl: new URL(job.PositionURI).href,
    publisher: null,
    title,
    company: plain(job.OrganizationName) || plain(job.DepartmentName),
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote: place.remote,
    workplace: usaJobsWorkplace(job, place),
    level: usaJobsLevel(job, title),
    employmentType: usaJobsEmploymentType(job, title),
    ...yearlySalary(job),
    technologies: [],
    description: htmlToText(descriptionHtml),
    descriptionHtml,
    postedAt: easternTimeToIso(job.PublicationStartDate),
    closesAt: easternTimeToIso(job.ApplicationCloseDate)
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface UsaJobsOptions {
  http?: HttpClient
  env?: NodeJS.ProcessEnv
  maxPages?: number
  minIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function createUsaJobsSource ({
  http = createHttpClient({ concurrency: 1 }),
  env = process.env,
  maxPages = USAJOBS_MAX_PAGES,
  minIntervalMs = USAJOBS_MIN_INTERVAL_MS,
  sleep = wait
}: UsaJobsOptions = {}): Source<UsaJobsItem> {
  return {
    id: 'usajobs',
    name: 'USAJOBS',
    attribution: {
      label: 'USAJOBS',
      url: 'https://www.usajobs.gov',
      termsUrl: 'https://developer.usajobs.gov/guides/terms-of-service'
    },
    priority: SOURCE_PRIORITY.usaJobs,
    requiredEnv: USAJOBS_ENV,
    async * fetchJobs ({ logger }) {
      const key = env.USAJOBS_API_KEY?.trim()
      const userAgent = env.USAJOBS_USER_AGENT?.trim()
      if (!key || !userAgent) throw new Error(`set ${USAJOBS_ENV.join(' and ')}`)
      // The URL already names the host (data.usajobs.gov), so fetch sends the `Host` header itself
      const headers = { 'Authorization-Key': key, 'User-Agent': userAgent }

      let total = 0
      let kept = 0
      for (let page = 1; page <= maxPages; page++) {
        if (page > 1) await sleep(minIntervalMs)
        const body = await http.getJson<UsaJobsPage>(usaJobsUrl(page), headers)
        const items = body?.SearchResult?.SearchResultItems
        if (!Array.isArray(items)) throw new Error('unexpected response: SearchResultItems is not a list')

        for (const item of items as UsaJobsItem[]) {
          total++
          if (!item?.MatchedObjectDescriptor || !keepUsaJobsJob(item)) continue
          kept++
          yield item
        }
        const pages = Number(body.SearchResult?.UserArea?.NumberOfPages)
        if (items.length < USAJOBS_RESULTS_PER_PAGE || (Number.isFinite(pages) && page >= pages)) break
        if (page === maxPages) logger.warn(`[usajobs] stopped after ${maxPages} pages; later jobs were not fetched`)
      }
      logger.info(`[usajobs] kept ${kept} of ${total} jobs`)
    },
    normalize: normalizeUsaJobsJob
  }
}
