// HTTP client for source adapters. Being a good citizen: every request has a timeout, failures
// that may be temporary are retried with exponential backoff, only a few requests run at once,
// and the User-Agent says who is asking and where to find us.
export const USER_AGENT = 'CodeHired/0.1 (+https://github.com/Daniel-Pino-2000/CodeHired)'

// Rate limited, or a server error that a later attempt may not hit
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export class HttpError extends Error {
  constructor (readonly status: number, readonly url: string) {
    super(`GET ${url} responded ${status}`)
    this.name = 'HttpError'
  }
}

export interface HttpClientOptions {
  // Per attempt, including reading the body
  timeoutMs?: number
  // Attempts after the first one
  retries?: number
  // Delay before the first retry; it doubles on every retry, up to `maxDelayMs`
  baseDelayMs?: number
  maxDelayMs?: number
  // Requests in flight at the same time, across everything that shares this client
  concurrency?: number
  // Injected by tests, which must never hit the network
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Runs at most `concurrency` tasks at once; the rest wait in order
export function createLimiter (concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []

  return async function limit<T> (task: () => Promise<T>): Promise<T> {
    if (active < concurrency) {
      active++
    } else {
      // The task that finishes hands its slot over, so `active` stays the same
      await new Promise<void>((resolve) => queue.push(resolve))
    }

    try {
      return await task()
    } finally {
      const next = queue.shift()
      if (next) next()
      else active--
    }
  }
}

// `Retry-After` is either a number of seconds or an HTTP date
function retryAfterMs (response: Response) {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()
  return Number.isFinite(ms) ? Math.max(0, ms) : null
}

export function createHttpClient ({
  timeoutMs = 15_000,
  retries = 3,
  baseDelayMs = 500,
  maxDelayMs = 30_000,
  concurrency = 4,
  fetch: fetchImpl = globalThis.fetch,
  sleep = wait
}: HttpClientOptions = {}) {
  const limit = createLimiter(concurrency)

  // Up to 20% of random jitter, so parallel retries do not all land at the same moment
  const backoff = (retry: number) => {
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** retry)
    return delay + Math.random() * delay * 0.2
  }

  async function request<T> (url: string, read: (response: Response) => Promise<T>, headers: Record<string, string>) {
    for (let attempt = 0; ; attempt++) {
      let response: Response
      let body: T
      try {
        response = await fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, ...headers },
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (response.ok) body = await read(response)
      } catch (error) {
        // Network error, timeout or a body cut short
        if (attempt >= retries) {
          throw new Error(`GET ${url} failed after ${attempt + 1} attempts`, { cause: error })
        }
        await sleep(backoff(attempt))
        continue
      }

      if (response.ok) return body!
      // Free the connection; not awaited, the body is not needed
      response.body?.cancel().catch(() => {})
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= retries) {
        throw new HttpError(response.status, url)
      }
      await sleep(Math.min(maxDelayMs, retryAfterMs(response) ?? backoff(attempt)))
    }
  }

  return {
    getJson<T = unknown> (url: string, headers: Record<string, string> = {}) {
      return limit(() => request(url, (response) => response.json() as Promise<T>, { Accept: 'application/json', ...headers }))
    },
    getText (url: string, headers: Record<string, string> = {}) {
      return limit(() => request(url, (response) => response.text(), headers))
    }
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>
