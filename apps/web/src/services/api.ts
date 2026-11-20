import type { ApiErrorBody } from '@codehired/shared/api'
import { API_URL } from '../config.ts'

export class ApiError extends Error {
  status: number
  // Field errors from a 400 (`{ email: ['Invalid email address'] }`), when the API sends them
  details: Record<string, string[]>

  constructor (message: string, status: number, details?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details ?? {}
  }
}

// The HTTP status of an API error (404, 409...), or undefined for anything else: the network
// failed, or the request was aborted
export const errorStatus = (error: unknown): number | undefined => (error instanceof ApiError ? error.status : undefined)

// What a `catch` caught, as an Error to keep in state and show its message
export const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

interface RequestOptions {
  body?: unknown
  signal?: AbortSignal
}

// Sends the session cookie with every request. The web app calls the API on its own origin, so
// `same-origin` would do; `include` also covers a VITE_API_URL on another origin.
// `T` is what the route answers with, from the API's shared types (`@codehired/shared/api`). The
// answer isn't checked at runtime: the shared types are what keep both sides in step.
async function request<T> (method: string, path: string, { body, signal }: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (!response.ok) {
    const data: Partial<ApiErrorBody> = await response.json().catch(() => ({}))
    throw new ApiError(data.error ?? response.statusText, response.status, data.details)
  }

  // A 204 has no body: those routes are called with `T` = `null`
  return (response.status === 204 ? null : await response.json()) as T
}

interface Signal {
  signal?: AbortSignal
}

export const getJson = <T>(path: string, { signal }: Signal = {}) => request<T>('GET', path, { signal })
export const postJson = <T>(path: string, body?: unknown, { signal }: Signal = {}) => request<T>('POST', path, { body, signal })
export const putJson = <T>(path: string, body?: unknown, { signal }: Signal = {}) => request<T>('PUT', path, { body, signal })
export const patchJson = <T>(path: string, body?: unknown, { signal }: Signal = {}) => request<T>('PATCH', path, { body, signal })
export const deleteJson = <T = null>(path: string, { signal }: Signal = {}) => request<T>('DELETE', path, { signal })

// Every query parameter GET /jobs understands
const JOBS_PARAMS = [
  'text', 'technology', 'level', 'workplace', 'employmentType', 'postedWithin', 'state',
  'minSalary', 'hasSalary', 'source', 'company', 'sort', 'limit', 'offset'
] as const

// GET /jobs filters as the web app holds them: strings from the URL, plus the page's numbers.
// The API validates each one.
export type JobsQuery = Partial<Record<(typeof JOBS_PARAMS)[number], string | number | null>>

// Builds `/jobs?text=...&level=...`, skipping empty filters
export function jobsPath (filters: JobsQuery) {
  const params = new URLSearchParams()

  for (const key of JOBS_PARAMS) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }

  return `/jobs?${params}`
}

export const jobPath = (id: string) => `/jobs/${encodeURIComponent(id)}`

export const companiesPath = ({ limit, offset = 0 }: { limit: number, offset?: number }) =>
  `/companies?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`
export const companyPath = (slug: string) => `/companies/${encodeURIComponent(slug)}`

export const SOURCES_PATH = '/sources'
