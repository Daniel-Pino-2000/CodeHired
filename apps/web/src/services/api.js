import { API_URL } from '../config.js'

export class ApiError extends Error {
  constructor (message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function getJson (path, { signal } = {}) {
  const response = await fetch(`${API_URL}${path}`, { signal })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(body.error ?? response.statusText, response.status)
  }

  return response.json()
}

// Every query parameter GET /jobs understands
const JOBS_PARAMS = [
  'text', 'technology', 'level', 'workplace', 'employmentType', 'postedWithin', 'state',
  'minSalary', 'hasSalary', 'source', 'company', 'sort', 'limit', 'offset'
]

// Builds `/jobs?text=...&level=...`, skipping empty filters
export function jobsPath (filters) {
  const params = new URLSearchParams()

  for (const key of JOBS_PARAMS) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') params.set(key, value)
  }

  return `/jobs?${params}`
}

export const jobPath = (id) => `/jobs/${encodeURIComponent(id)}`

export const companiesPath = ({ limit, offset = 0 }) => `/companies?${new URLSearchParams({ limit, offset })}`
export const companyPath = (slug) => `/companies/${encodeURIComponent(slug)}`

export const SOURCES_PATH = '/sources'
