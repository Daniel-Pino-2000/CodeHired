// Company boards hosted on Ashby. Public Job Postings API, no key:
// https://developers.ashbyhq.com/docs/public-job-posting-api
import { companiesOn, type Company } from '../companies.js'
import { formatUsLocation, isTechRole, isUsCountry, parseUsLocation, type UsPlace } from '../filters.js'
import type { HttpClient } from '../http.js'
import {
  htmlToText,
  inferEmploymentType,
  inferLevel,
  inferWorkplace,
  usdYearlySalary
} from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import { boardPath, createBoardSource, expectArray, type BoardPosting, type BoardSourceOptions } from './board.js'

interface AshbyAddress {
  postalAddress?: {
    addressCountry?: string | null
    addressRegion?: string | null
    addressLocality?: string | null
  } | null
}

// The fields CodeHired reads from GET /posting-api/job-board/{name}?includeCompensation=true
export interface AshbyJob {
  id: string
  title: string
  jobUrl: string
  department?: string | null
  team?: string | null
  // 'FullTime', 'PartTime', 'Intern', 'Contract' or 'Temporary'
  employmentType?: string | null
  location?: string | null
  address?: AshbyAddress | null
  secondaryLocations?: Array<{ location?: string | null, address?: AshbyAddress | null }> | null
  isRemote?: boolean | null
  // 'OnSite', 'Remote' or 'Hybrid'; more reliable than `isRemote`, which hybrid roles also set
  workplaceType?: string | null
  isListed?: boolean | null
  descriptionHtml?: string | null
  publishedAt?: string | null
  compensation?: {
    summaryComponents?: Array<{
      compensationType?: string | null
      interval?: string | null
      currencyCode?: string | null
      minValue?: number | null
      maxValue?: number | null
    }> | null
  } | null
}

export const ashbyBoardUrl = (company: Company) =>
  `https://api.ashbyhq.com/posting-api/job-board/${boardPath(company)}?includeCompensation=true`

async function fetchBoard (http: HttpClient, company: Company) {
  const body = await http.getJson<{ jobs?: unknown }>(ashbyBoardUrl(company))
  return expectArray<AshbyJob>(body?.jobs, 'jobs')
}

// The main location first, then the secondary ones. An address with a country settles the
// question; a location without one has to name a US place.
function ashbyPlace (job: AshbyJob): UsPlace | null {
  const locations = [
    { text: job.location, address: job.address },
    ...(job.secondaryLocations ?? []).map((secondary) => ({ text: secondary.location, address: secondary.address }))
  ]
  for (const { text, address } of locations) {
    const country = address?.postalAddress?.addressCountry
    if (country && !isUsCountry(country)) continue
    const place = parseUsLocation(text, { assumeUs: isUsCountry(country) })
    if (place) return place
  }
  return null
}

function isRemote (job: AshbyJob) {
  return job.workplaceType ? job.workplaceType === 'Remote' : job.isRemote === true
}

function keep (job: AshbyJob) {
  return job.isListed !== false &&
    isTechRole({ title: job.title, departments: [job.department, job.team] }) &&
    ashbyPlace(job) !== null
}

function ashbySalary (compensation: AshbyJob['compensation']) {
  const salary = compensation?.summaryComponents?.find((component) =>
    component.compensationType === 'Salary' && component.interval === '1 YEAR')
  return usdYearlySalary(salary?.minValue, salary?.maxValue, salary?.currencyCode)
}

export function normalizeAshbyJob ({ company, posting: job }: BoardPosting<AshbyJob>): NormalizedJobInput {
  const place = ashbyPlace(job)
  if (!place) throw new Error('not a US location')

  const remote = place.remote || isRemote(job)
  const descriptionHtml = job.descriptionHtml?.trim() || null

  return {
    sourceId: `${company.token}:${job.id}`,
    sourceUrl: job.jobUrl,
    publisher: null,
    title: job.title,
    company: company.name,
    location: formatUsLocation({ ...place, remote }),
    city: place.city,
    state: place.state,
    country: place.country,
    remote,
    workplace: inferWorkplace({ remote, text: job.workplaceType ?? '' }),
    level: inferLevel(job.title),
    employmentType: inferEmploymentType(`${job.employmentType ?? ''} ${job.title}`),
    ...ashbySalary(job.compensation),
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: job.publishedAt ?? null
  }
}

export function createAshbySource ({ companies = companiesOn('ashby'), http }: BoardSourceOptions = {}) {
  return createBoardSource<AshbyJob>({
    id: 'ashby',
    name: 'Company boards on Ashby',
    attribution: { label: 'Ashby', url: 'https://www.ashbyhq.com' },
    companies,
    http,
    fetchBoard,
    keep,
    normalize: normalizeAshbyJob
  })
}
