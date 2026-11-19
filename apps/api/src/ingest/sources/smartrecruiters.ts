// Company boards hosted on SmartRecruiters. Public Posting API, no key for public postings:
// https://developers.smartrecruiters.com/docs/posting-api (the customer overview lists it among the
// endpoints that need no authentication because the data is public).
// The list endpoint has no descriptions, so each kept posting costs one more request.
import { companiesOn, type Company } from '../companies.js'
import { formatUsLocation, isTechRole, isUsCountry, parseUsLocation, type UsPlace } from '../filters.js'
import type { HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, inferWorkplace, usdYearlySalary } from '../normalize.js'
import { SOURCE_PRIORITY } from '../dedupe.js'
import type { NormalizedJobInput } from '../schema.js'
import { boardPath, createBoardSource, expectArray, type BoardPosting, type BoardSourceOptions } from './board.js'

interface Labelled {
  id?: string | number | null
  label?: string | null
}

interface SmartRecruitersSection {
  title?: string | null
  // HTML
  text?: string | null
}

// The fields CodeHired reads from GET /v1/companies/{id}/postings (the list) and, for `postingUrl`
// and `jobAd`, from GET /v1/companies/{id}/postings/{postingId} (one posting)
export interface SmartRecruitersPosting {
  id: string
  name: string
  releasedDate?: string | null
  location?: {
    city?: string | null
    // A state's name or code: "Texas", "TX"; sometimes the country again ("UNITED STATES")
    region?: string | null
    // ISO code in lower case: "us"
    country?: string | null
    remote?: boolean | null
    hybrid?: boolean | null
    fullLocation?: string | null
  } | null
  department?: Labelled | null
  function?: Labelled | null
  // "Pharmaceuticals", "Automotive": tells a lab scientist from a data scientist
  industry?: Labelled | null
  // "Full-time", "Part-time", "Contract", "Intern"...
  typeOfEmployment?: Labelled | null
  // Only in the single posting
  postingUrl?: string | null
  jobAd?: {
    sections?: Partial<Record<SectionKey, SmartRecruitersSection | null>> | null
  } | null
}

// The sections of a job ad, in the order the posting page shows them
const SECTIONS = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation'] as const
type SectionKey = (typeof SECTIONS)[number]

// The list endpoint's page size limit
export const SMARTRECRUITERS_PAGE_SIZE = 100
// Large employers list thousands of US postings, most of them not tech roles: 20 pages is 2,000
export const SMARTRECRUITERS_MAX_PAGES = 20

const API = 'https://api.smartrecruiters.com/v1/companies'

// US postings only: the API filters by country, so foreign postings are never downloaded
export const smartRecruitersListUrl = (company: Company, offset: number) =>
  `${API}/${boardPath(company)}/postings?country=us&limit=${SMARTRECRUITERS_PAGE_SIZE}&offset=${offset}`

export const smartRecruitersPostingUrl = (company: Company, id: string) =>
  `${API}/${boardPath(company)}/postings/${encodeURIComponent(id)}`

interface ListResult {
  totalFound?: number
  content?: unknown
}

async function fetchBoard (http: HttpClient, company: Company) {
  const postings: SmartRecruitersPosting[] = []
  for (let page = 0; page < SMARTRECRUITERS_MAX_PAGES; page++) {
    const body = await http.getJson<ListResult>(smartRecruitersListUrl(company, postings.length))
    const content = expectArray<SmartRecruitersPosting>(body?.content, 'content')
    postings.push(...content)
    if (content.length < SMARTRECRUITERS_PAGE_SIZE || postings.length >= (body?.totalFound ?? 0)) break
  }
  return postings
}

async function fetchDetails (http: HttpClient, company: Company, posting: SmartRecruitersPosting) {
  const details = await http.getJson<SmartRecruitersPosting>(smartRecruitersPostingUrl(company, posting.id))
  // The list's fields are kept when the single posting leaves one out
  return { ...posting, ...details }
}

function smartRecruitersPlace (posting: SmartRecruitersPosting): UsPlace | null {
  const location = posting.location
  if (!isUsCountry(location?.country)) return null
  const remote = location?.remote === true
  const city = location?.city?.trim()
  const region = location?.region?.trim()
  const text = city && region ? `${city}, ${region}` : region || city || location?.fullLocation
  const place = parseUsLocation(text, { assumeUs: true })
  // The country is the API's own filter, so a location it cannot read is still in the US
  return place ? { ...place, remote } : { city: null, state: null, country: 'US', remote }
}

const departments = (posting: SmartRecruitersPosting) => [posting.department?.label, posting.function?.label, posting.industry?.label]

function keep (posting: SmartRecruitersPosting) {
  return isTechRole({ title: posting.name, departments: departments(posting) }) && smartRecruitersPlace(posting) !== null
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Every section with text, each under its own heading
function descriptionHtml (posting: SmartRecruitersPosting) {
  const sections = posting.jobAd?.sections ?? {}
  const html = SECTIONS
    .map((key) => sections[key])
    .filter((section) => section?.text?.trim())
    .map((section) => {
      const title = section!.title?.trim()
      return `${title ? `<h3>${escapeHtml(title)}</h3>` : ''}${section!.text!.trim()}`
    })
    .join('\n')
  return html || null
}

export function normalizeSmartRecruitersPosting ({ company, posting }: BoardPosting<SmartRecruitersPosting>): NormalizedJobInput {
  const place = smartRecruitersPlace(posting)
  if (!place) throw new Error('not a US location')

  const html = descriptionHtml(posting)
  const remote = place.remote

  return {
    sourceId: `${company.token}:${posting.id}`,
    sourceUrl: posting.postingUrl ?? `https://jobs.smartrecruiters.com/${boardPath(company)}/${encodeURIComponent(posting.id)}`,
    publisher: null,
    title: posting.name.trim(),
    company: company.name,
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote,
    workplace: inferWorkplace({ remote, text: posting.location?.hybrid ? 'hybrid' : '' }),
    level: inferLevel(posting.name),
    employmentType: inferEmploymentType(`${posting.typeOfEmployment?.label ?? ''} ${posting.name}`),
    // The Posting API does not publish pay
    ...usdYearlySalary(null, null),
    technologies: [],
    description: html ? htmlToText(html) : '',
    descriptionHtml: html,
    postedAt: posting.releasedDate ?? null
  }
}

export function createSmartRecruitersSource ({ companies = companiesOn('smartrecruiters'), http }: BoardSourceOptions = {}) {
  return createBoardSource<SmartRecruitersPosting>({
    id: 'smartrecruiters',
    name: 'Company boards on SmartRecruiters',
    attribution: {
      label: 'SmartRecruiters',
      url: 'https://www.smartrecruiters.com',
      termsUrl: 'https://developers.smartrecruiters.com/docs/posting-api'
    },
    priority: SOURCE_PRIORITY.companyAts,
    companies,
    http,
    fetchBoard,
    keep,
    fetchDetails,
    normalize: normalizeSmartRecruitersPosting
  })
}
