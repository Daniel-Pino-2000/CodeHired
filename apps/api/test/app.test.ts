import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { createTestApp } from './helpers.js'

const app = createTestApp()
const ALLOWED_ORIGIN = 'http://localhost:5173'

describe('app', () => {
  test('GET /health responds ok', async () => {
    const res = await request(app).get('/health')

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { status: 'ok' })
  })

  test('unknown routes respond 404 with a JSON error', async () => {
    const res = await request(app).get('/nope')

    assert.equal(res.status, 404)
    assert.match(res.body.error, /GET \/nope/)
  })

  test('does not expose the x-powered-by header', async () => {
    const res = await request(app).get('/health')

    assert.equal(res.headers['x-powered-by'], undefined)
  })
})

describe('CORS', () => {
  test('allows origins listed in CORS_ORIGINS', async () => {
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN)

    assert.equal(res.headers['access-control-allow-origin'], ALLOWED_ORIGIN)
    assert.equal(res.headers.vary, 'Origin')
  })

  test('sends no CORS headers to other origins', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example')

    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  test('answers preflight requests with 204', async () => {
    const res = await request(app).options('/jobs').set('Origin', ALLOWED_ORIGIN)

    assert.equal(res.status, 204)
    assert.match(res.headers['access-control-allow-methods'], /GET/)
  })
})
