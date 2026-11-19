import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import { seedJobs } from '../src/db/seed.js'
import { JobModel } from '../src/models/job.js'
import type { SavedJob } from '../src/types.js'

await runMigrations()
await seedJobs()
// Every test registers its own users
const app = createApp({ authRateLimit: { limit: 1000, windowMs: 60_000 } })

const { rows: jobRows } = await db.execute('SELECT id FROM jobs ORDER BY id')
const jobIds = jobRows.map((row) => String(row.id))

let users = 0

// A new account's `codehired_session=<token>` cookie, to send as a Cookie header
async function signUp () {
  const res = await request(app).post('/auth/register')
    .send({ email: `saver${++users}@example.com`, password: 'correct horse battery', name: 'Ana Smith' })
  assert.equal(res.status, 201)
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return cookies.find((cookie) => cookie.startsWith('codehired_session='))!.split(';')[0]
}

const save = (cookie: string, jobId: string) => request(app).put(`/me/saved-jobs/${encodeURIComponent(jobId)}`).set('Cookie', cookie)
const unsave = (cookie: string, jobId: string) => request(app).delete(`/me/saved-jobs/${encodeURIComponent(jobId)}`).set('Cookie', cookie)
async function list (cookie: string) {
  const res = await request(app).get('/me/saved-jobs').set('Cookie', cookie)
  assert.equal(res.status, 200)
  return res.body as { data: SavedJob[], total: number }
}

describe('/me/saved-jobs', () => {
  test('answers 401 without a session', async () => {
    assert.equal((await request(app).get('/me/saved-jobs')).status, 401)
    assert.equal((await request(app).put(`/me/saved-jobs/${jobIds[0]}`)).status, 401)
    assert.equal((await request(app).delete(`/me/saved-jobs/${jobIds[0]}`)).status, 401)
  })

  test('starts empty', async () => {
    assert.deepEqual(await list(await signUp()), { data: [], total: 0 })
  })

  test('saves a job and lists it like GET /jobs/:id, with the save date', async () => {
    const cookie = await signUp()

    const res = await save(cookie, jobIds[0])
    assert.equal(res.status, 204)

    const { data, total } = await list(cookie)
    assert.equal(total, 1)
    const [saved] = data
    const { body: job } = await request(app).get(`/jobs/${jobIds[0]}`)
    const { descriptionHtml, alsoPostedOn, ...listed } = job
    assert.deepEqual({ ...saved, savedAt: undefined, open: undefined }, { ...listed, savedAt: undefined, open: undefined })
    assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    assert.equal(saved.open, true)
  })

  test('saving twice keeps one save and its first date', async () => {
    const cookie = await signUp()
    await save(cookie, jobIds[0])
    await db.execute({ sql: 'UPDATE saved_jobs SET created_at = ? WHERE job_id = ?', args: ['2026-01-01T00:00:00Z', jobIds[0]] })

    assert.equal((await save(cookie, jobIds[0])).status, 204)

    const { data } = await list(cookie)
    assert.equal(data.length, 1)
    assert.equal(data[0].savedAt, '2026-01-01T00:00:00Z')
  })

  test('lists the most recently saved first', async () => {
    const cookie = await signUp()
    for (const id of jobIds.slice(0, 3)) await save(cookie, id)
    const userId = (await request(app).get('/auth/me').set('Cookie', cookie)).body.user.id
    for (const [index, id] of jobIds.slice(0, 3).entries()) {
      await db.execute({
        sql: 'UPDATE saved_jobs SET created_at = ? WHERE user_id = ? AND job_id = ?',
        args: [`2026-01-0${index + 1}T00:00:00Z`, userId, id]
      })
    }

    const { data } = await list(cookie)
    assert.deepEqual(data.map((job) => job.id), jobIds.slice(0, 3).reverse())
  })

  test('answers 404 for a job that does not exist', async () => {
    const cookie = await signUp()
    const res = await save(cookie, 'no-such-job')

    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Job not found')
    assert.equal((await list(cookie)).total, 0)
  })

  test('removes a save, and removing it again is not an error', async () => {
    const cookie = await signUp()
    await save(cookie, jobIds[0])
    await save(cookie, jobIds[1])

    assert.equal((await unsave(cookie, jobIds[0])).status, 204)
    assert.equal((await unsave(cookie, jobIds[0])).status, 204)

    assert.deepEqual((await list(cookie)).data.map((job) => job.id), [jobIds[1]])
  })

  test('every user only sees and removes their own saves', async () => {
    const ana = await signUp()
    const ben = await signUp()
    await save(ana, jobIds[0])
    await save(ben, jobIds[1])

    await unsave(ben, jobIds[0])

    assert.deepEqual((await list(ana)).data.map((job) => job.id), [jobIds[0]])
    assert.deepEqual((await list(ben)).data.map((job) => job.id), [jobIds[1]])
  })

  test('keeps a closed job, marked as not open, until ingestion deletes the job', async () => {
    const cookie = await signUp()
    const [closedId, expiredId] = jobIds.slice(-2)
    await save(cookie, closedId)
    await save(cookie, expiredId)

    // Closed by its source, and past its application deadline
    await db.execute({ sql: "UPDATE jobs SET source = 'greenhouse', closed_at = '2026-01-01T00:00:00Z' WHERE id = ?", args: [closedId] })
    await db.execute({ sql: "UPDATE jobs SET closes_at = '2026-01-01T00:00:00Z' WHERE id = ?", args: [expiredId] })

    const { data } = await list(cookie)
    assert.deepEqual(data.map((job) => [job.id, job.open]).sort(), [[closedId, false], [expiredId, false]].sort())

    // Deleting the job deletes the save with it (ON DELETE CASCADE)
    assert.equal(await JobModel.deleteClosed('2026-02-01T00:00:00Z'), 1)
    assert.deepEqual((await list(cookie)).data.map((job) => job.id), [expiredId])
  })
})
