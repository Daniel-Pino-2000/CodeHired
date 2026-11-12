// Company boards hosted on Lever. Public Postings API, no key: https://github.com/lever/postings-api
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

// The fields CodeHired reads from GET /v0/postings/{company}?mode=json
export interface LeverPosting {
  id: string
  text: string
  hostedUrl: string
  categories?: {
    commitment?: string | null
    department?: string | null
    team?: string | null
    location?: string | null
    allLocations?: string[] | null
  } | null
  // ISO code of the main location
  country?: string | null
  // 'on-site', 'remote', 'hybrid' or 'unspecified'
  workplaceType?: string | null
  // HTML: the opening and the body
  description?: string | null
  // Titled bullet lists ("What you'll do"), each `content` is a run of <li>
  lists?: Array<{ text?: string | null, content?: string | null }> | null
  // HTML closing section, often with the pay
  additional?: string | null
  // Milliseconds since the epoch
  createdAt?: number | null
  salaryRange?: {
    min?: number | null
    max?: number | null
    currency?: string | null
    interval?: string | null
  } | null
}

export const leverBoardUrl = (company: Company) => `https://api.lever.co/v0/postings/${boardPath(company)}?mode=json`

async function fetchBoard (http: HttpClient, company: Company) {
  return expectArray<LeverPosting>(await http.getJson(leverBoardUrl(company)), 'postings')
}

// `country` describes the main location only; the other locations have to speak for themselves
function leverPlace (posting: LeverPosting): UsPlace | null {
  const main = posting.categories?.location
  const others = (posting.categories?.allLocations ?? []).filter((location) => location !== main)
  if (posting.country && !isUsCountry(posting.country)) {
    return others.map((location) => parseUsLocation(location)).find(Boolean) ?? null
  }
  const assumeUs = isUsCountry(posting.country)
  return parseUsLocation(main, { assumeUs }) ??
    others.map((location) => parseUsLocation(location)).find(Boolean) ??
    (assumeUs ? { city: null, state: null, country: 'US', remote: posting.workplaceType === 'remote' } : null)
}

function keep (posting: LeverPosting) {
  const departments = [posting.categories?.department, posting.categories?.team]
  return isTechRole({ title: posting.text, departments }) && leverPlace(posting) !== null
}

// The whole posting as one HTML document, in the order the hosted page shows it
function leverHtml (posting: LeverPosting) {
  const lists = (posting.lists ?? []).map((list) => `<h3>${list.text ?? ''}</h3><ul>${list.content ?? ''}</ul>`)
  return [posting.description, ...lists, posting.additional].filter(Boolean).join('\n').trim()
}

function leverSalary (range: LeverPosting['salaryRange']) {
  if (range?.interval !== 'per-year-salary') return usdYearlySalary(null, null)
  return usdYearlySalary(range.min, range.max, range.currency)
}

export function normalizeLeverPosting ({ company, posting }: BoardPosting<LeverPosting>): NormalizedJobInput {
  const place = leverPlace(posting)
  if (!place) throw new Error('not a US location')

  const remote = place.remote || posting.workplaceType === 'remote'
  const descriptionHtml = leverHtml(posting) || null

  return {
    sourceId: `${company.token}:${posting.id}`,
    sourceUrl: posting.hostedUrl,
    publisher: null,
    title: posting.text,
    company: company.name,
    location: formatUsLocation({ ...place, remote }),
    city: place.city,
    state: place.state,
    country: place.country,
    remote,
    workplace: inferWorkplace({ remote, text: posting.workplaceType ?? '' }),
    level: inferLevel(posting.text),
    employmentType: inferEmploymentType(`${posting.categories?.commitment ?? ''} ${posting.text}`),
    ...leverSalary(posting.salaryRange),
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: typeof posting.createdAt === 'number' ? new Date(posting.createdAt).toISOString() : null
  }
}

export function createLeverSource ({ companies = companiesOn('lever'), http }: BoardSourceOptions = {}) {
  return createBoardSource<LeverPosting>({
    id: 'lever',
    name: 'Company boards on Lever',
    attribution: { label: 'Lever', url: 'https://www.lever.co' },
    companies,
    http,
    fetchBoard,
    keep,
    normalize: normalizeLeverPosting
  })
}
