import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import type { Profile } from '../src/types.js'

await runMigrations()
// Every test registers its own users
const app = createApp({ authRateLimit: { limit: 1000, windowMs: 60_000 } })

let users = 0

// A new account's `codehired_session=<token>` cookie, to send as a Cookie header
async function signUp () {
  const res = await request(app).post('/auth/register')
    .send({ email: `candidate${++users}@example.com`, password: 'correct horse battery', name: 'Ana Smith' })
  assert.equal(res.status, 201)
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return cookies.find((cookie) => cookie.startsWith('codehired_session='))!.split(';')[0]
}

const get = (cookie: string) => request(app).get('/me/profile').set('Cookie', cookie)
const put = (cookie: string, body: object) => request(app).put('/me/profile').set('Cookie', cookie).send(body)

const FULL = {
  headline: '  Frontend developer  ',
  location: 'Austin, TX',
  bio: 'I build accessible web apps.',
  skills: ['React', 'typescript', 'react', 'node'],
  yearsOfExperience: 4,
  desiredLevel: 'mid',
  desiredWorkplace: 'remote',
  links: {
    github: 'https://github.com/ana',
    linkedin: 'https://www.linkedin.com/in/ana',
    portfolio: 'https://ana.dev'
  },
  resumeUrl: 'https://drive.google.com/file/d/abc/view'
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

describe('/me/profile', () => {
  test('answers 401 without a session', async () => {
    assert.equal((await request(app).get('/me/profile')).status, 401)
    assert.equal((await request(app).put('/me/profile').send(FULL)).status, 401)
  })

  test('is empty before the first save', async () => {
    const res = await get(await signUp())

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      headline: null,
      location: null,
      bio: '',
      skills: [],
      yearsOfExperience: null,
      desiredLevel: null,
      desiredWorkplace: null,
      links: { github: null, linkedin: null, portfolio: null },
      resumeUrl: null,
      updatedAt: null
    })
  })

  test('saves the whole profile, trimmed, with skills lowercased once each', async () => {
    const cookie = await signUp()

    const res = await put(cookie, FULL)

    assert.equal(res.status, 200)
    const profile = res.body as Profile
    assert.match(profile.updatedAt!, TIMESTAMP)
    assert.deepEqual({ ...profile, updatedAt: undefined }, {
      ...FULL,
      headline: 'Frontend developer',
      skills: ['react', 'typescript', 'node'],
      updatedAt: undefined
    })
    assert.deepEqual((await get(cookie)).body, profile)
  })

  test('replaces it whole: fields left out or blank are cleared', async () => {
    const cookie = await signUp()
    await put(cookie, FULL)

    const res = await put(cookie, { headline: 'Backend developer', location: '', links: { github: '' }, yearsOfExperience: '' })

    assert.equal(res.status, 200)
    const profile = res.body as Profile
    assert.equal(profile.headline, 'Backend developer')
    assert.equal(profile.location, null)
    assert.equal(profile.bio, '')
    assert.deepEqual(profile.skills, [])
    assert.equal(profile.yearsOfExperience, null)
    assert.equal(profile.desiredLevel, null)
    assert.deepEqual(profile.links, { github: null, linkedin: null, portfolio: null })
    assert.equal(profile.resumeUrl, null)
  })

  test('keeps each user to their own profile', async () => {
    const ana = await signUp()
    const ben = await signUp()
    await put(ana, FULL)

    assert.equal((await get(ben)).body.headline, null)
  })

  for (const [name, body, field] of [
    ['a skill outside the technology list', { skills: ['react', 'cobol-on-rails'] }, 'skills'],
    ['more than 20 skills', { skills: Array.from({ length: 21 }, () => 'react') }, 'skills'],
    ['an unknown level', { desiredLevel: 'principal' }, 'desiredLevel'],
    ['an unknown workplace', { desiredWorkplace: 'moon' }, 'desiredWorkplace'],
    ['negative years of experience', { yearsOfExperience: -1 }, 'yearsOfExperience'],
    ['fractional years of experience', { yearsOfExperience: 2.5 }, 'yearsOfExperience'],
    ['a javascript: resume link', { resumeUrl: 'javascript:alert(1)' }, 'resumeUrl'],
    ['a GitHub link to another site', { links: { github: 'https://gitlab.com/ana' } }, 'links.github'],
    ['a LinkedIn link to another site', { links: { linkedin: 'https://linkedin.com.evil.example/in/ana' } }, 'links.linkedin'],
    ['a headline over 120 characters', { headline: 'x'.repeat(121) }, 'headline']
  ] as const) {
    test(`answers 400 for ${name}, naming the field`, async () => {
      const res = await put(await signUp(), body)

      assert.equal(res.status, 400)
      assert.ok(res.body.details[field]?.length, JSON.stringify(res.body.details))
    })
  }

  test('accepts LinkedIn country subdomains and plain http links', async () => {
    const res = await put(await signUp(), {
      links: { linkedin: 'https://uk.linkedin.com/in/ana', portfolio: 'http://ana.example' }
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.links.linkedin, 'https://uk.linkedin.com/in/ana')
  })

  test('is deleted with its user', async () => {
    const cookie = await signUp()
    await put(cookie, FULL)
    const { rows: [user] } = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [`candidate${users}@example.com`] })

    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [user.id] })

    const { rows } = await db.execute({ sql: 'SELECT 1 FROM profiles WHERE user_id = ?', args: [user.id] })
    assert.equal(rows.length, 0)
  })
})
