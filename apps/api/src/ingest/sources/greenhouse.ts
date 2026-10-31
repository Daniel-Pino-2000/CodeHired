// Company boards hosted on Greenhouse. Public Job Board API, no key:
// https://developers.greenhouse.io/job-board.html
import { companiesOn, type Company } from '../companies.js'
import { formatUsLocation, isTechRole, parseUsLocation, type UsPlace } from '../filters.js'
import type { HttpClient } from '../http.js'
import {
  decodeEntities,
  htmlToText,
  inferEmploymentType,
  inferLevel,
  inferWorkplace,
  usdYearlySalary
} from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import { boardPath, createBoardSource, expectArray, type BoardPosting, type BoardSourceOptions } from './board.js'

// The fields CodeHired reads from GET /v1/boards/{token}/jobs?content=true&pay_transparency=true
export interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  location?: { name?: string | null } | null
  offices?: Array<{ name?: string | null, location?: string | null }>
  departments?: Array<{ name?: string | null }>
  // Entity-escaped HTML: `&lt;p&gt;`
  content?: string | null
  first_published?: string | null
  updated_at?: string | null
  // Only when the company publishes pay. Not documented for the list endpoint, but it answers it.
  pay_input_ranges?: Array<{
    min_cents?: number | null
    max_cents?: number | null
    currency_type?: string | null
  }>
}

export const greenhouseBoardUrl = (company: Company) =>
  `https://boards-api.greenhouse.io/v1/boards/${boardPath(company)}/jobs?content=true&pay_transparency=true`

async function fetchBoard (http: HttpClient, company: Company) {
  const body = await http.getJson<{ jobs?: unknown }>(greenhouseBoardUrl(company))
  return expectArray<GreenhouseJob>(body?.jobs, 'jobs')
}

const mentionsRemote = (text: string | null | undefined) => /\bremote\b/i.test(text ?? '')

// The location name is free text ("San Francisco Bay Area", "Remote - US"); offices are more
// regular ("San Francisco, California, United States"), so they are the fallback.
function greenhousePlace (job: GreenhouseJob): UsPlace | null {
  const name = job.location?.name
  const fromName = parseUsLocation(name)
  if (fromName) return fromName

  for (const office of job.offices ?? []) {
    const place = parseUsLocation(office.location) ?? parseUsLocation(office.name)
    if (!place) continue
    // "Remote" with a US office is a US remote role, not a remote role in that city
    return mentionsRemote(name) ? { city: null, state: null, country: 'US', remote: true } : place
  }
  return null
}

function keep (job: GreenhouseJob) {
  const departments = (job.departments ?? []).map((department) => department.name)
  return isTechRole({ title: job.title, departments }) && greenhousePlace(job) !== null
}

// The US ranges (one per pay zone, like "NYC" and "Rest of US") become one range covering them all
function greenhouseSalary (ranges: GreenhouseJob['pay_input_ranges'] = []) {
  const usd = ranges.filter((range) => (range.currency_type ?? 'USD') === 'USD')
  const mins = usd.map((range) => range.min_cents).filter((cents) => typeof cents === 'number')
  const maxes = usd.map((range) => range.max_cents).filter((cents) => typeof cents === 'number')
  return usdYearlySalary(
    mins.length > 0 ? Math.min(...mins) / 100 : null,
    maxes.length > 0 ? Math.max(...maxes) / 100 : null
  )
}

export function normalizeGreenhouseJob ({ company, posting: job }: BoardPosting<GreenhouseJob>): NormalizedJobInput {
  const place = greenhousePlace(job)
  if (!place) throw new Error('not a US location')

  const descriptionHtml = job.content ? decodeEntities(job.content).trim() || null : null
  const remote = place.remote

  return {
    sourceId: `${company.token}:${job.id}`,
    sourceUrl: job.absolute_url,
    publisher: null,
    title: job.title,
    company: company.name,
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote,
    workplace: inferWorkplace({ remote, text: `${job.location?.name ?? ''} ${job.title}` }),
    level: inferLevel(job.title),
    employmentType: inferEmploymentType(job.title),
    ...greenhouseSalary(job.pay_input_ranges),
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: job.first_published ?? job.updated_at ?? null
  }
}

export function createGreenhouseSource ({ companies = companiesOn('greenhouse'), http }: BoardSourceOptions = {}) {
  return createBoardSource<GreenhouseJob>({
    id: 'greenhouse',
    name: 'Company boards on Greenhouse',
    attribution: { label: 'Greenhouse', url: 'https://www.greenhouse.com' },
    companies,
    http,
    fetchBoard,
    keep,
    normalize: normalizeGreenhouseJob
  })
}
