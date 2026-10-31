// Remote OK: remote jobs from a public JSON feed, no key: https://remoteok.com/api
// Terms (the first element of the feed): link back to the job on Remote OK with a followed link,
// name Remote OK as the source, never use its logo. See docs/data-sources.md.
import { SOURCE_PRIORITY } from '../dedupe.js'
import { formatUsLocation, isNonUsPlace, isTechRole, parseRemoteLocation } from '../filters.js'
import { createHttpClient, type HttpClient } from '../http.js'
import { htmlToText, inferEmploymentType, inferLevel, usdYearlySalary } from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

export const REMOTEOK_URL = 'https://remoteok.com/api'

// The fields CodeHired reads from one job of the feed
export interface RemoteOkJob {
  id: string | number
  url: string
  position: string
  company: string
  location?: string | null
  tags?: string[] | null
  // HTML
  description?: string | null
  date?: string | null
  // Yearly, in dollars; 0 when not published
  salary_min?: number | null
  salary_max?: number | null
}

// The feed starts with its legal notice, which is not a job
const isJob = (entry: unknown): entry is RemoteOkJob =>
  typeof entry === 'object' && entry !== null && 'position' in entry && 'url' in entry

// The location is often empty and the region is in the title instead: "Senior Engineer LATAM"
export function keepRemoteOkJob (job: RemoteOkJob) {
  return isTechRole({ title: job.position }) &&
    !isNonUsPlace(job.position) &&
    parseRemoteLocation(job.location) !== null
}

export function normalizeRemoteOkJob (job: RemoteOkJob): NormalizedJobInput {
  const place = parseRemoteLocation(job.location)
  if (!place) throw new Error('not open to US-based applicants')
  const descriptionHtml = job.description?.trim() || null

  return {
    sourceId: String(job.id),
    sourceUrl: job.url,
    publisher: null,
    title: job.position,
    company: job.company,
    location: formatUsLocation(place),
    city: place.city,
    state: place.state,
    country: place.country,
    remote: true,
    workplace: 'remote',
    level: inferLevel(job.position),
    employmentType: inferEmploymentType(job.position),
    ...usdYearlySalary(job.salary_min, job.salary_max),
    technologies: [],
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: job.date ?? null
  }
}

export function createRemoteOkSource ({ http = createHttpClient({ concurrency: 1 }) }: { http?: HttpClient } = {}): Source<RemoteOkJob> {
  return {
    id: 'remoteok',
    name: 'Remote OK',
    attribution: { label: 'Remote OK', url: 'https://remoteok.com' },
    priority: SOURCE_PRIORITY.remoteBoard,
    async * fetchJobs ({ logger }) {
      // One request returns the whole feed
      const feed = await http.getJson(REMOTEOK_URL)
      if (!Array.isArray(feed)) throw new Error('unexpected response: the feed is not a list')
      const jobs = feed.filter(isJob)
      const kept = jobs.filter(keepRemoteOkJob)
      logger.info(`[remoteok] kept ${kept.length} of ${jobs.length} jobs`)
      yield * kept
    },
    normalize: normalizeRemoteOkJob
  }
}
