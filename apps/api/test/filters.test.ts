import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatUsLocation, isTechRole, isUsCountry, parseUsLocation } from '../src/ingest/filters.js'
import { usdYearlySalary } from '../src/ingest/normalize.js'

describe('parseUsLocation', () => {
  const cases: Array<[string, ReturnType<typeof parseUsLocation>]> = [
    ['Austin, TX', { city: 'Austin', state: 'TX', country: 'US', remote: false }],
    ['San Francisco, California, United States', { city: 'San Francisco', state: 'CA', country: 'US', remote: false }],
    ['New York, NY (HQ)', { city: 'New York', state: 'NY', country: 'US', remote: false }],
    ['Washington, D.C.', { city: 'Washington', state: 'DC', country: 'US', remote: false }],
    ['WA - Seattle', { city: 'Seattle', state: 'WA', country: 'US', remote: false }],
    ['Mountain View CA', { city: 'Mountain View', state: 'CA', country: 'US', remote: false }],
    ['San Francisco Bay Area', { city: 'San Francisco Bay Area', state: 'CA', country: 'US', remote: false }],
    ['NYC', { city: 'NYC', state: 'NY', country: 'US', remote: false }],
    ['SF, New York, Seattle', { city: 'SF', state: 'CA', country: 'US', remote: false }],
    ['Remote (US)', { city: null, state: null, country: 'US', remote: true }],
    ['Remote - United States', { city: null, state: null, country: 'US', remote: true }],
    ['Remote-Friendly, United States', { city: null, state: null, country: 'US', remote: true }],
    ['Remote from the US', { city: null, state: null, country: 'US', remote: true }],
    ['Remote - Colorado', { city: null, state: 'CO', country: 'US', remote: true }],
    ['Hybrid - Denver, CO', { city: 'Denver', state: 'CO', country: 'US', remote: false }],
    ['United States', { city: null, state: null, country: 'US', remote: false }],
    ['Remote, Global', { city: null, state: null, country: null, remote: true }],
    ['London, UK; Austin, TX', { city: 'Austin', state: 'TX', country: 'US', remote: false }],
    ['San Francisco Bay Area or Remote (U.S.)', { city: 'San Francisco Bay Area', state: 'CA', country: 'US', remote: false }]
  ]
  for (const [text, expected] of cases) {
    test(`"${text}"`, () => {
      assert.deepEqual(parseUsLocation(text), expected)
    })
  }

  test('rejects places outside the US, and places nothing says are in the US', () => {
    for (const text of ['London, UK', 'Toronto, CA', 'Remote - CA', 'Bengaluru, IN', 'Remote Canada', 'Remote', 'Europe', 'Berlin', '', null]) {
      assert.equal(parseUsLocation(text), null, String(text))
    }
  })

  test('trusts the source when it gives the country separately', () => {
    assert.deepEqual(parseUsLocation('Remote', { assumeUs: true }), { city: null, state: null, country: 'US', remote: true })
    assert.deepEqual(parseUsLocation('Boise', { assumeUs: true }), { city: 'Boise', state: null, country: 'US', remote: false })
  })
})

describe('formatUsLocation', () => {
  test('names the place the way the job cards show it', () => {
    const place = { city: null, state: null, country: 'US' as const, remote: false }
    assert.equal(formatUsLocation({ ...place, city: 'Austin', state: 'TX' }), 'Austin, TX')
    assert.equal(formatUsLocation({ ...place, state: 'MD' }), 'Maryland')
    assert.equal(formatUsLocation({ ...place, city: 'Seattle', state: 'WA', remote: true }), 'Remote (Seattle, WA)')
    assert.equal(formatUsLocation({ ...place, remote: true }), 'Remote (US)')
    assert.equal(formatUsLocation(place), 'United States')
    assert.equal(formatUsLocation({ ...place, country: null, remote: true }), 'Remote')
  })
})

test('isUsCountry accepts the spellings the sources use', () => {
  for (const country of ['US', 'us', 'USA', 'United States', 'United States of America']) assert.equal(isUsCountry(country), true, country)
  for (const country of ['GB', 'Canada', 'European Union', '', null, undefined]) assert.equal(isUsCountry(country), false, String(country))
})

describe('isTechRole', () => {
  test('keeps software, data and infrastructure roles', () => {
    for (const title of [
      'Senior Software Engineer', 'Frontend Developer', 'Staff Site Reliability Engineer', 'Data Scientist, Growth',
      'Machine Learning Engineer', 'Engineering Manager, Payments', 'QA/DevOps Engineer', 'Security Engineer, Cloud',
      'Software Engineer, Ads Solutions Engineering'
    ]) {
      assert.equal(isTechRole({ title }), true, title)
    }
  })

  test('drops roles that only sit near engineering, and other kinds of engineering', () => {
    for (const title of [
      'Account Executive', 'Senior Sales Engineer', 'Solutions Engineer', 'Technical Support Engineer',
      'Engineering Recruiter', 'Mechanical Engineer', 'Body Structures Engineer', 'Product Manager', 'Legal Engineer'
    ]) {
      assert.equal(isTechRole({ title }), false, title)
    }
  })

  test('drops an engineer in a sales department', () => {
    assert.equal(isTechRole({ title: 'Partner Engineer', departments: ['Sales'] }), false)
    assert.equal(isTechRole({ title: 'Partner Engineer', departments: ['Engineering', null] }), true)
  })
})

describe('usdYearlySalary', () => {
  test('keeps a yearly range in dollars', () => {
    assert.deepEqual(usdYearlySalary(150000, '189,000'), { salaryMin: 150000, salaryMax: 189000, currency: 'USD' })
    assert.deepEqual(usdYearlySalary(150000, null, 'usd'), { salaryMin: 150000, salaryMax: null, currency: 'USD' })
  })

  test('drops hourly rates, other currencies and ranges that cannot be right', () => {
    const none = { salaryMin: null, salaryMax: null, currency: 'USD' }
    assert.deepEqual(usdYearlySalary(45, 60), none)
    assert.deepEqual(usdYearlySalary(949500, 1502000, 'NOK'), none)
    assert.deepEqual(usdYearlySalary(200000, 100000), none)
    assert.deepEqual(usdYearlySalary(32000, 485000), none)
    assert.deepEqual(usdYearlySalary(152405, 179300152), { salaryMin: 152405, salaryMax: null, currency: 'USD' })
  })
})
