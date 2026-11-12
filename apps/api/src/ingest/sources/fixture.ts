// Reads fictional jobs from a local JSON file. Used by the tests (which must never hit the
// network) and to try the pipeline locally: `pnpm ingest --source=fixture`.
import { readFile } from 'node:fs/promises'
import {
  formatLocation,
  htmlToText,
  inferEmploymentType,
  inferLevel,
  inferWorkplace,
  normalizeTechnologies,
  toWholeNumber
} from '../normalize.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Source } from '../types.js'

// Loosely modeled on a public ATS job board response
export interface FixtureJob {
  id: string | number
  title: string
  company: string
  url: string
  location?: {
    city?: string
    state?: string
    country?: string
    remote?: boolean
  }
  workplace_type?: string
  employment_type?: string
  salary?: {
    min?: number | string
    max?: number | string
    currency?: string
  }
  tags?: string[]
  description_html?: string
  published_at?: string
}

// Same relative path from `src/ingest/sources` and from `dist/ingest/sources`
export const FIXTURES_DIR = new URL('../../../test/fixtures/', import.meta.url)

export function normalizeFixtureJob (raw: FixtureJob): NormalizedJobInput {
  const { city = null, state = null, country = null, remote = false } = raw.location ?? {}
  const descriptionHtml = raw.description_html ?? null

  return {
    sourceId: String(raw.id),
    sourceUrl: raw.url,
    publisher: null,
    title: raw.title,
    company: raw.company,
    location: formatLocation({ city, state, country, remote }),
    city,
    state,
    country,
    remote,
    workplace: inferWorkplace({ remote, text: raw.workplace_type }),
    level: inferLevel(raw.title),
    employmentType: inferEmploymentType(`${raw.employment_type ?? ''} ${raw.title}`),
    salaryMin: toWholeNumber(raw.salary?.min),
    salaryMax: toWholeNumber(raw.salary?.max),
    currency: raw.salary?.currency ?? 'USD',
    technologies: normalizeTechnologies(raw.tags ?? []),
    description: descriptionHtml ? htmlToText(descriptionHtml) : '',
    descriptionHtml,
    postedAt: raw.published_at ?? null
  }
}

export function createFixtureSource (file = new URL('jobs.json', FIXTURES_DIR), id = 'fixture'): Source<FixtureJob> {
  return {
    id,
    name: 'Fixture (fictional jobs)',
    attribution: { label: 'Sample data', url: 'https://github.com/Daniel-Pino-2000/CodeHired' },
    devOnly: true,
    async * fetchJobs () {
      const { jobs } = JSON.parse(await readFile(file, 'utf8')) as { jobs: FixtureJob[] }
      yield * jobs
    },
    normalize: normalizeFixtureJob
  }
}
