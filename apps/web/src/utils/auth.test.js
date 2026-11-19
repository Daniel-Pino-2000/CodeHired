import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apiFieldErrors, loginPath, safeNext, validateLogin, validateRegister } from './auth.js'

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    assert.equal(safeNext('/account'), '/account')
    assert.equal(safeNext('/search?text=react&level=senior'), '/search?text=react&level=senior')
  })

  it('refuses other sites and odd values', () => {
    for (const next of [null, undefined, '', 'account', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      assert.equal(safeNext(next), '/', String(next))
    }
  })

  it('never goes back to the login or register page', () => {
    for (const next of ['/login', '/login?next=/account', '/register', '/register/']) {
      assert.equal(safeNext(next), '/', next)
    }
    assert.equal(safeNext('/loginhelp'), '/loginhelp')
  })
})

describe('loginPath', () => {
  it('keeps the page and its query string', () => {
    assert.equal(loginPath({ pathname: '/account', search: '?tab=saved' }), '/login?next=%2Faccount%3Ftab%3Dsaved')
    assert.equal(loginPath({ pathname: '/account' }), '/login?next=%2Faccount')
  })
})

describe('validateLogin', () => {
  it('asks for both fields', () => {
    assert.deepEqual(validateLogin({ email: ' ', password: '' }), {
      email: 'Enter your email',
      password: 'Enter your password'
    })
  })

  it('checks the email shape', () => {
    assert.equal(validateLogin({ email: 'ana@', password: 'x' }).email, 'Enter a valid email address')
    assert.deepEqual(validateLogin({ email: ' ana@example.com ', password: 'x' }), {})
  })
})

describe('validateRegister', () => {
  const valid = { name: 'Ana', email: 'ana@example.com', password: 'long-enough' }

  it('accepts a complete form', () => {
    assert.deepEqual(validateRegister(valid), {})
  })

  it('uses the API limits', () => {
    assert.equal(validateRegister({ ...valid, password: 'short' }).password, 'Use at least 8 characters')
    assert.equal(validateRegister({ ...valid, password: 'x'.repeat(129) }).password, 'Use at most 128 characters')
    assert.equal(validateRegister({ ...valid, name: '  ' }).name, 'Enter your name')
    assert.equal(validateRegister({ ...valid, name: 'x'.repeat(101) }).name, 'Use at most 100 characters')
  })
})

describe('apiFieldErrors', () => {
  it('takes the first message of each field', () => {
    const error = { details: { email: ['Invalid email address', 'Too long'], name: [] } }
    assert.deepEqual(apiFieldErrors(error), { email: 'Invalid email address' })
    assert.deepEqual(apiFieldErrors(new Error('offline')), {})
  })
})
