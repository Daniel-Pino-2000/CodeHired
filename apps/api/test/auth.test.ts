import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { SignJWT } from 'jose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { db } from '../src/db/database.js'
import { runMigrations } from '../src/db/migrations.js'
import { sessionCookieOptions, signSession } from '../src/utils/session.js'

await runMigrations()
// Rate limits are tested with an app of their own below
const app = createApp({ authRateLimit: { limit: 1000, windowMs: 60_000 } })

const PASSWORD = 'correct horse battery'
const COOKIE = 'codehired_session'

// Everything the API writes to the console while this file runs, to prove no password is logged
const logged: string[] = []
const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info }
before(() => {
  for (const method of Object.keys(originals) as Array<keyof typeof originals>) {
    console[method] = (...args: unknown[]) => { logged.push(args.map((arg) => arg instanceof Error ? `${arg.stack} ${JSON.stringify(arg)}` : JSON.stringify(arg)).join(' ')) }
  }
})
after(() => {
  Object.assign(console, originals)
  assert.ok(!logged.some((line) => line.includes(PASSWORD)), 'a password was logged')
})

// `codehired_session=<token>` from a response, to send back as a Cookie header
function sessionCookie (res: request.Response) {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  const cookie = cookies.find((value) => value.startsWith(`${COOKIE}=`))
  assert.ok(cookie, 'the response sets the session cookie')
  return cookie
}
const cookiePair = (res: request.Response) => sessionCookie(res).split(';')[0]

let emails = 0
const newEmail = () => `user${++emails}@example.com`

async function register (email = newEmail(), password = PASSWORD) {
  const res = await request(app).post('/auth/register').send({ email, password, name: 'Ana Smith' })
  assert.equal(res.status, 201)
  return res
}

describe('POST /auth/register', () => {
  test('creates the account, signs in and never returns the hash', async () => {
    const res = await request(app).post('/auth/register').send({ email: '  Ana@Example.COM ', password: PASSWORD, name: ' Ana ' })

    assert.equal(res.status, 201)
    assert.deepEqual(Object.keys(res.body.user).sort(), ['createdAt', 'email', 'id', 'name', 'role'])
    assert.equal(res.body.user.email, 'ana@example.com')
    assert.equal(res.body.user.name, 'Ana')
    assert.equal(res.body.user.role, 'candidate')
    assert.ok(!JSON.stringify(res.body).includes(PASSWORD))

    const cookie = sessionCookie(res)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    assert.match(cookie, /Path=\//)
    assert.match(cookie, /Max-Age=604800/)
  })

  test('stores an argon2id hash, not the password', async () => {
    const email = newEmail()
    await register(email)

    const { rows } = await db.execute({ sql: 'SELECT password_hash FROM users WHERE email = ?', args: [email] })
    const stored = String(rows[0].password_hash)
    assert.match(stored, /^\$argon2id\$/)
    assert.ok(!stored.includes(PASSWORD))
  })

  test('answers 409 for an email that is taken, whatever its case', async () => {
    const email = newEmail()
    await register(email)

    const res = await request(app).post('/auth/register').send({ email: email.toUpperCase(), password: PASSWORD, name: 'Other' })

    assert.equal(res.status, 409)
    assert.equal(res.headers['set-cookie'], undefined)
  })

  test('validates the body without echoing it', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'not-an-email', password: 'short', name: '' })

    assert.equal(res.status, 400)
    assert.deepEqual(Object.keys(res.body.details).sort(), ['email', 'name', 'password'])
    assert.ok(!JSON.stringify(res.body).includes('short'))
  })

  test('rejects very long passwords before hashing them', async () => {
    const res = await request(app).post('/auth/register').send({ email: newEmail(), password: 'x'.repeat(129), name: 'Ana' })

    assert.equal(res.status, 400)
  })
})

describe('POST /auth/login', () => {
  test('signs in with the right password, in any email case', async () => {
    const email = newEmail()
    await register(email)

    const res = await request(app).post('/auth/login').send({ email: ` ${email.toUpperCase()}`, password: PASSWORD })

    assert.equal(res.status, 200)
    assert.equal(res.body.user.email, email)
    assert.equal(res.body.user.passwordHash, undefined)
    sessionCookie(res)
  })

  test('gives the same 401 for a wrong password and an unknown email', async () => {
    const email = newEmail()
    await register(email)

    const wrong = await request(app).post('/auth/login').send({ email, password: 'wrong password' })
    const unknown = await request(app).post('/auth/login').send({ email: 'nobody@example.com', password: PASSWORD })

    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.deepEqual(wrong.body, unknown.body)
    assert.equal(wrong.headers['set-cookie'], undefined)
  })

  test('answers 400 for a missing password', async () => {
    const res = await request(app).post('/auth/login').send({ email: newEmail() })

    assert.equal(res.status, 400)
  })
})

describe('GET /auth/me', () => {
  test('returns the signed-in user', async () => {
    const registered = await register()

    const res = await request(app).get('/auth/me').set('Cookie', cookiePair(registered))

    assert.equal(res.status, 200)
    assert.deepEqual(res.body.user, registered.body.user)
  })

  test('answers 401 without a session', async () => {
    const res = await request(app).get('/auth/me')

    assert.equal(res.status, 401)
  })

  test('answers 401 for a tampered token', async () => {
    const pair = cookiePair(await register())

    const res = await request(app).get('/auth/me').set('Cookie', `${pair.slice(0, -2)}xx`)

    assert.equal(res.status, 401)
  })

  test('answers 401 for a token signed with another secret', async () => {
    const { body } = await register()
    const forged = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(body.user.id))
      .setIssuer('codehired')
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode('not-the-secret'))

    const res = await request(app).get('/auth/me').set('Cookie', `${COOKIE}=${forged}`)

    assert.equal(res.status, 401)
  })

  test('answers 401 once the account is gone', async () => {
    const { body } = await register()
    const token = await signSession(body.user.id)
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [body.user.id] })

    const res = await request(app).get('/auth/me').set('Cookie', `${COOKIE}=${token}`)

    assert.equal(res.status, 401)
  })
})

describe('POST /auth/logout', () => {
  test('clears the session cookie', async () => {
    const res = await request(app).post('/auth/logout').set('Cookie', cookiePair(await register()))

    assert.equal(res.status, 204)
    const cookie = sessionCookie(res)
    assert.match(cookie, new RegExp(`^${COOKIE}=;`))
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/)
  })
})

describe('/me/*', () => {
  test('answers 401 without a valid session', async () => {
    for (const path of ['/me', '/me/favorites', '/me/applications/1']) {
      const res = await request(app).get(path)
      assert.equal(res.status, 401, path)
    }
    const res = await request(app).get('/me/favorites').set('Cookie', `${COOKIE}=garbage`)
    assert.equal(res.status, 401)
  })

  test('lets a signed-in user through', async () => {
    const res = await request(app).get('/me/favorites').set('Cookie', cookiePair(await register()))

    // No /me routes exist yet (#13), so a signed-in request reaches the 404
    assert.equal(res.status, 404)
  })
})

describe('rate limiting', () => {
  test('blocks an IP after too many failed logins', async () => {
    const limited = createApp({ authRateLimit: { limit: 3, windowMs: 60_000 } })
    const email = newEmail()
    await request(limited).post('/auth/register').send({ email, password: PASSWORD, name: 'Ana' })

    // Successful logins do not count
    for (let i = 0; i < 3; i++) {
      assert.equal((await request(limited).post('/auth/login').send({ email, password: PASSWORD })).status, 200)
    }
    for (let i = 0; i < 3; i++) {
      assert.equal((await request(limited).post('/auth/login').send({ email, password: 'wrong password' })).status, 401)
    }

    const res = await request(limited).post('/auth/login').send({ email, password: PASSWORD })
    assert.equal(res.status, 429)
    assert.match(res.body.error, /Too many attempts/)
  })
})

describe('request bodies', () => {
  test('answers 400 to malformed JSON without logging it', async () => {
    const before = logged.length

    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(`{"email": "a@example.com", "password": "${PASSWORD}"`)

    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'Invalid JSON body')
    assert.equal(logged.length, before)
  })
})

describe('sessionCookieOptions', () => {
  test('is Secure outside local development', () => {
    assert.equal(sessionCookieOptions({ isDevelopment: false }).secure, true)
    assert.equal(sessionCookieOptions({ isDevelopment: true }).secure, false)
    assert.equal(sessionCookieOptions().httpOnly, true)
    assert.equal(sessionCookieOptions().sameSite, 'lax')
  })
})
