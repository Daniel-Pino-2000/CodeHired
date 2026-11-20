import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import { seedJobs } from '../src/db/seed.js'
import { JobModel } from '../src/models/job.js'
import type { Application } from '../src/types.js'

await runMigrations()
await seedJobs()
// Every test registers its own users
const app = createApp({ authRateLimit: { limit: 1000, windowMs: 60_000 } })

const { rows: jobRows } = await db.execute('SELECT id, company, title FROM jobs ORDER BY id')
const jobs = jobRows.map((row) => ({ id: String(row.id), company: String(row.company), title: String(row.title) }))

// One seed job dressed up as a JSearch job found on LinkedIn, one as a Greenhouse job
const [linkedIn, greenhouse] = jobs
await db.execute({
  sql: "UPDATE jobs SET source = 'jsearch', source_url = 'https://www.linkedin.com/jobs/view/1', publisher = 'LinkedIn' WHERE id = ?",
  args: [linkedIn.id]
})
await db.execute({
  sql: "UPDATE jobs SET source = 'greenhouse', source_url = 'https://boards.greenhouse.io/acme/jobs/2' WHERE id = ?",
  args: [greenhouse.id]
})

let users = 0

// A new account's `codehired_session=<token>` cookie, to send as a Cookie header
async function signUp () {
  const res = await request(app).post('/auth/register')
    .send({ email: `applicant${++users}@example.com`, password: 'correct horse battery', name: 'Ana Smith' })
  assert.equal(res.status, 201)
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return cookies.find((cookie) => cookie.startsWith('codehired_session='))!.split(';')[0]
}

const create = (cookie: string, body: object) => request(app).post('/me/applications').set('Cookie', cookie).send(body)
const update = (cookie: string, id: number | string, body: object) => request(app).patch(`/me/applications/${id}`).set('Cookie', cookie).send(body)
const remove = (cookie: string, id: number | string) => request(app).delete(`/me/applications/${id}`).set('Cookie', cookie)
async function list (cookie: string) {
  const res = await request(app).get('/me/applications').set('Cookie', cookie)
  assert.equal(res.status, 200)
  return res.body as { data: Application[], total: number }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

describe('/me/applications', () => {
  test('answers 401 without a session', async () => {
    assert.equal((await request(app).get('/me/applications')).status, 401)
    assert.equal((await request(app).post('/me/applications').send({ jobId: linkedIn.id })).status, 401)
    assert.equal((await request(app).patch('/me/applications/1').send({ status: 'offer' })).status, 401)
    assert.equal((await request(app).delete('/me/applications/1')).status, 401)
  })

  test('starts empty', async () => {
    assert.deepEqual(await list(await signUp()), { data: [], total: 0 })
  })

  test('records a CodeHired job with its company, title, link and publisher', async () => {
    const cookie = await signUp()

    const res = await create(cookie, { jobId: linkedIn.id, appliedAt: '2026-11-18' })

    assert.equal(res.status, 201)
    const application = res.body as Application
    assert.deepEqual({ ...application, id: undefined, createdAt: undefined, updatedAt: undefined }, {
      id: undefined,
      jobId: linkedIn.id,
      company: linkedIn.company,
      title: linkedIn.title,
      url: 'https://www.linkedin.com/jobs/view/1',
      source: 'LinkedIn',
      status: 'applied',
      notes: '',
      appliedAt: '2026-11-18',
      followUpAt: null,
      open: true,
      createdAt: undefined,
      updatedAt: undefined
    })
    assert.match(application.createdAt, TIMESTAMP)
    assert.deepEqual((await list(cookie)).data, [application])
  })

  test("names the source when the job has no publisher, and ignores the job's fields sent along", async () => {
    const cookie = await signUp()

    const res = await create(cookie, { jobId: greenhouse.id, company: 'Not this one', title: 'Nor this' })

    assert.equal(res.status, 201)
    assert.equal(res.body.source, 'Greenhouse')
    assert.equal(res.body.company, greenhouse.company)
    assert.equal(res.body.title, greenhouse.title)
    // No date given: today
    assert.match(res.body.appliedAt, DATE)
  })

  test('recording the same CodeHired job twice answers 409 with the existing application', async () => {
    const cookie = await signUp()
    const first = await create(cookie, { jobId: linkedIn.id })

    const second = await create(cookie, { jobId: linkedIn.id, status: 'interviewing' })

    assert.equal(second.status, 409)
    assert.equal(second.body.error, 'You already track this job')
    assert.equal(second.body.id, first.body.id)
    const { data } = await list(cookie)
    assert.deepEqual(data.map((item) => [item.id, item.status]), [[first.body.id, 'applied']])

    // Another user can record the same job
    assert.equal((await create(await signUp(), { jobId: linkedIn.id })).status, 201)
  })

  test('answers 404 for a job that does not exist', async () => {
    const cookie = await signUp()
    const res = await create(cookie, { jobId: 'no-such-job' })

    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Job not found')
    assert.equal((await list(cookie)).total, 0)
  })

  test('adds external applications by hand, next to the CodeHired ones', async () => {
    const cookie = await signUp()
    const codehired = await create(cookie, { jobId: linkedIn.id })

    const manual = await create(cookie, {
      company: '  Initech ',
      title: 'Backend Engineer',
      url: 'https://initech.example.com/careers/42',
      source: 'Company site',
      status: 'interviewing',
      notes: 'Referred by Sam',
      appliedAt: '2026-11-01',
      followUpAt: '2026-11-20'
    })

    assert.equal(manual.status, 201)
    assert.equal(manual.body.jobId, null)
    assert.equal(manual.body.company, 'Initech')
    assert.equal(manual.body.open, null)
    assert.equal(manual.body.followUpAt, '2026-11-20')

    // A manual entry can repeat: the same job tracked twice by hand is the user's call
    assert.equal((await create(cookie, { company: 'Initech', title: 'Backend Engineer' })).status, 201)

    const { data, total } = await list(cookie)
    assert.equal(total, 3)
    assert.ok(data.some((item) => item.id === codehired.body.id))
    assert.equal(data.filter((item) => item.jobId === null).length, 2)
  })

  test('a manual entry needs a company and a title, and only web links', async () => {
    const cookie = await signUp()

    const missing = await create(cookie, { title: '  ' })
    assert.equal(missing.status, 400)
    assert.deepEqual(Object.keys(missing.body.details).sort(), ['company', 'title'])

    for (const url of ['javascript:alert(1)', 'ftp://example.com/job', 'not a link']) {
      const res = await create(cookie, { company: 'Acme', title: 'Engineer', url })
      assert.equal(res.status, 400, url)
      assert.ok(res.body.details.url, url)
    }

    const badValues = await create(cookie, { company: 'Acme', title: 'Engineer', status: 'ghosted', appliedAt: '2026-02-30' })
    assert.equal(badValues.status, 400)
    assert.deepEqual(Object.keys(badValues.body.details).sort(), ['appliedAt', 'status'])

    assert.equal((await list(cookie)).total, 0)
  })

  test('a saved application has no date until it moves on', async () => {
    const cookie = await signUp()
    const { body: saved } = await create(cookie, { company: 'Acme', title: 'Engineer', status: 'saved' })
    assert.equal(saved.appliedAt, null)

    const { body: applied } = await update(cookie, saved.id, { status: 'applied' })
    assert.match(applied.appliedAt, DATE)

    // A date the user picked is kept
    await update(cookie, saved.id, { appliedAt: '2026-10-01' })
    const { body: interviewing } = await update(cookie, saved.id, { status: 'interviewing' })
    assert.equal(interviewing.appliedAt, '2026-10-01')
  })

  test('changes only the fields sent, and lists the most recently changed first', async () => {
    const cookie = await signUp()
    const { body: first } = await create(cookie, { jobId: linkedIn.id, notes: 'Keep me' })
    const { body: second } = await create(cookie, { company: 'Initech', title: 'Engineer', url: 'https://initech.example.com' })
    await db.execute({ sql: "UPDATE applications SET updated_at = '2026-01-01T00:00:00Z' WHERE id IN (?, ?)", args: [first.id, second.id] })

    const res = await update(cookie, first.id, { status: 'interviewing', followUpAt: '2026-12-01' })

    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'interviewing')
    assert.equal(res.body.followUpAt, '2026-12-01')
    assert.equal(res.body.notes, 'Keep me')
    assert.notEqual(res.body.updatedAt, '2026-01-01T00:00:00Z')
    assert.deepEqual((await list(cookie)).data.map((item) => item.id), [first.id, second.id])

    // Blank fields clear what can be cleared
    const cleared = await update(cookie, second.id, { url: '', followUpAt: '', source: ' ' })
    assert.equal(cleared.status, 200)
    assert.deepEqual([cleared.body.url, cleared.body.followUpAt, cleared.body.source], [null, null, null])
  })

  test('rejects an empty or invalid change', async () => {
    const cookie = await signUp()
    const { body: application } = await create(cookie, { company: 'Acme', title: 'Engineer' })

    assert.equal((await update(cookie, application.id, {})).status, 400)
    assert.equal((await update(cookie, application.id, { title: '' })).status, 400)
    assert.equal((await update(cookie, application.id, { status: 'ghosted' })).status, 400)
  })

  test('every user only sees, changes and removes their own applications', async () => {
    const ana = await signUp()
    const ben = await signUp()
    const { body: anas } = await create(ana, { jobId: linkedIn.id })

    assert.equal((await update(ben, anas.id, { status: 'rejected' })).status, 404)
    assert.equal((await remove(ben, anas.id)).status, 204)

    assert.deepEqual((await list(ana)).data.map((item) => [item.id, item.status]), [[anas.id, 'applied']])
    assert.equal((await list(ben)).total, 0)
  })

  test('answers 404 for an id that is not an application', async () => {
    const cookie = await signUp()
    for (const id of ['999999', 'abc', '0', '1e3']) {
      assert.equal((await update(cookie, id, { status: 'offer' })).status, 404, id)
      assert.equal((await remove(cookie, id)).status, 204, id)
    }
  })

  test('removes an application, and removing it again is not an error', async () => {
    const cookie = await signUp()
    const { body: application } = await create(cookie, { jobId: linkedIn.id })

    assert.equal((await remove(cookie, application.id)).status, 204)
    assert.equal((await remove(cookie, application.id)).status, 204)
    assert.equal((await list(cookie)).total, 0)

    // The job can be recorded again after that
    assert.equal((await create(cookie, { jobId: linkedIn.id })).status, 201)
  })

  test('keeps the application when ingestion deletes its job', async () => {
    const cookie = await signUp()
    const closedId = jobs.at(-1)!.id
    const { body: application } = await create(cookie, { jobId: closedId })

    await db.execute({ sql: "UPDATE jobs SET source = 'greenhouse', closed_at = '2026-01-01T00:00:00Z' WHERE id = ?", args: [closedId] })
    assert.equal((await list(cookie)).data[0].open, false)

    assert.equal(await JobModel.deleteClosed('2026-02-01T00:00:00Z'), 1)

    const { data: [kept] } = await list(cookie)
    assert.deepEqual(kept, { ...application, jobId: null, open: null })
  })
})
