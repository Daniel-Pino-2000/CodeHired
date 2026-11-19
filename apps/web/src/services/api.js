import { API_URL } from '../config.js'

export class ApiError extends Error {
  constructor (message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    // Field errors from a 400 (`{ email: ['Invalid email address'] }`), when the API sends them
    this.details = details ?? {}
  }
}

// Sends the session cookie with every request. The web app calls the API on its own origin, so
// `same-origin` would do; `include` also covers a VITE_API_URL on another origin.
async function request (method, path, { body, signal } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new ApiError(data.error ?? response.statusText, response.status, data.details)
  }

  return response.status === 204 ? null : response.json()
}

export const getJson = (path, { signal } = {}) => request('GET', path, { signal })
export const postJson = (path, body, { signal } = {}) => request('POST', path, { body, signal })
export const putJson = (path, body, { signal } = {}) => request('PUT', path, { body, signal })
export const patchJson = (path, body, { signal } = {}) => request('PATCH', path, { body, signal })
export const deleteJson = (path, { signal } = {}) => request('DELETE', path, { signal })

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
