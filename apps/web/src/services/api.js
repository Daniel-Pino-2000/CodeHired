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

// Builds `/jobs?text=...&level=...`, skipping empty filters
export function jobsPath ({ text, technology, level, workplace, limit, offset }) {
  const params = new URLSearchParams()
  const entries = { text, technology, level, workplace, limit, offset }

  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value)
  }

  return `/jobs?${params}`
}

export const jobPath = (id) => `/jobs/${encodeURIComponent(id)}`
