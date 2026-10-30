import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHttpClient, createLimiter, HttpError, USER_AGENT } from '../src/ingest/http.js'

const URL = 'https://boards.example.com/jobs'

// A fake `fetch` that answers from a list, one response (or error) per call. The last answer
// is repeated, so it must be an error when more calls are expected (a body can be read once).
function fakeFetch (...answers: Array<Response | Error>) {
  const calls: Array<{ url: string, init: RequestInit }> = []
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const answer = answers[calls.length - 1] ?? answers.at(-1)!
    if (answer instanceof Error) throw answer
    return answer
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// Records the delays instead of waiting
function fakeSleep () {
  const delays: number[] = []
  return { sleep: async (ms: number) => { delays.push(ms) }, delays }
}

describe('createHttpClient', () => {
  test('sends a User-Agent that names CodeHired and links the repository', async () => {
    const { fetch, calls } = fakeFetch(json({ jobs: [] }))

    const body = await createHttpClient({ fetch }).getJson(URL)

    assert.deepEqual(body, { jobs: [] })
    const headers = calls[0].init.headers as Record<string, string>
    assert.equal(headers['User-Agent'], USER_AGENT)
    assert.match(USER_AGENT, /^CodeHired\/.+github\.com\/Daniel-Pino-2000\/CodeHired/)
    assert.equal(headers.Accept, 'application/json')
    assert.ok(calls[0].init.signal instanceof AbortSignal, 'every request has a timeout signal')
  })

  test('retries server errors with exponential backoff', async () => {
    const { fetch, calls } = fakeFetch(json({}, 503), json({}, 502), json({ ok: true }))
    const { sleep, delays } = fakeSleep()

    const body = await createHttpClient({ fetch, sleep, baseDelayMs: 100 }).getJson(URL)

    assert.deepEqual(body, { ok: true })
    assert.equal(calls.length, 3)
    assert.equal(delays.length, 2)
    assert.ok(delays[0] >= 100 && delays[0] <= 120, `first delay was ${delays[0]}`)
    assert.ok(delays[1] >= 200 && delays[1] <= 240, `second delay was ${delays[1]}`)
  })

  test('retries network errors and gives up after the last retry', async () => {
    const { fetch, calls } = fakeFetch(new TypeError('fetch failed'))
    const { sleep } = fakeSleep()

    await assert.rejects(createHttpClient({ fetch, sleep, retries: 2 }).getJson(URL), /failed after 3 attempts/)
    assert.equal(calls.length, 3)
  })

  test('honors Retry-After on 429 responses', async () => {
    const { fetch } = fakeFetch(json({}, 429, { 'Retry-After': '7' }), json({ ok: true }))
    const { sleep, delays } = fakeSleep()

    await createHttpClient({ fetch, sleep }).getJson(URL)

    assert.deepEqual(delays, [7000])
  })

  test('does not retry client errors such as 404', async () => {
    const { fetch, calls } = fakeFetch(json({}, 404))

    await assert.rejects(createHttpClient({ fetch }).getJson(URL), (error) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, 404)
      return true
    })
    assert.equal(calls.length, 1)
  })

  test('aborts a request that takes longer than the timeout', async () => {
    const hanging = (async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
    })) as unknown as typeof globalThis.fetch

    await assert.rejects(
      createHttpClient({ fetch: hanging, timeoutMs: 20, retries: 0 }).getText(URL),
      (error: Error) => {
        assert.match(error.message, /failed after 1 attempts/)
        assert.equal((error.cause as Error).name, 'TimeoutError')
        return true
      }
    )
  })
})

describe('createLimiter', () => {
  test('never runs more tasks at once than allowed, and runs them all', async () => {
    const limit = createLimiter(2)
    let running = 0
    let peak = 0

    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => limit(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return index
    })))

    assert.equal(peak, 2)
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5])
  })

  test('frees the slot when a task fails', async () => {
    const limit = createLimiter(1)

    await assert.rejects(limit(async () => { throw new Error('boom') }))

    assert.equal(await limit(async () => 'next'), 'next')
  })
})
