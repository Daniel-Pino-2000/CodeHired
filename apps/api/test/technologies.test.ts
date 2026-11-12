import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import dictionary from '@codehired/shared/technologies.json' with { type: 'json' }
import { SEED_JOBS } from '../src/db/seed-data.js'
import { refineWorkplace } from '../src/ingest/normalize.js'
import { enrichJob } from '../src/ingest/runner.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { normalizeFixtureJob } from '../src/ingest/sources/fixture.js'
import { TECHNOLOGY_SLUGS, tagTechnologies } from '../src/ingest/technologies.js'

describe('tagTechnologies', () => {
  test('finds the technologies a text mentions, in order of first mention', () => {
    assert.deepEqual(
      tagTechnologies('We use TypeScript and React on the front end, Node.js and PostgreSQL behind it, all on AWS with Kubernetes.'),
      ['typescript', 'react', 'node', 'postgresql', 'aws', 'kubernetes']
    )
  })

  test('matches whole names only', () => {
    assert.deepEqual(tagTechnologies('JavaScript experience'), ['javascript'], 'Java is not JavaScript')
    assert.deepEqual(tagTechnologies('PostgreSQL and NoSQL stores'), ['postgresql'], 'SQL inside other names does not count')
    assert.deepEqual(tagTechnologies('React Native apps'), ['react-native'])
    assert.deepEqual(tagTechnologies('C++ and C# services, ASP.NET'), ['c++', 'c#', '.net'])
    assert.deepEqual(tagTechnologies('Node.js, Next.js'), ['node', 'next.js'])
    assert.deepEqual(tagTechnologies('React-based UI'), ['react'])
  })

  test('names that are also words only count with their capitalization or context', () => {
    assert.deepEqual(tagTechnologies('Go to market with a swift, rusty spark of joy'), [])
    assert.deepEqual(tagTechnologies('Services in Go, Rust and Swift'), ['go', 'rust', 'swift'])
    assert.deepEqual(tagTechnologies('Experience with Golang'), ['go'])
    assert.deepEqual(tagTechnologies('Our Spring 2027 internship'), [])
    assert.deepEqual(tagTechnologies('Java with Spring Boot'), ['java', 'spring'])
  })
})

describe('the technology dictionary', () => {
  test('every entry has a label and patterns that compile', () => {
    for (const [slug, entry] of Object.entries(dictionary as Record<string, { label: string, match: string[] }>)) {
      assert.ok(entry.label.trim(), `${slug} has a label`)
      assert.ok(entry.match.length > 0, `${slug} has patterns`)
      for (const pattern of entry.match) assert.doesNotThrow(() => new RegExp(pattern), `${slug}: ${pattern}`)
    }
  })

  test('covers every technology the seed jobs use, so the web app has a label for each', () => {
    const missing = [...new Set(SEED_JOBS.flatMap((job) => job.technologies))].filter((slug) => !TECHNOLOGY_SLUGS.has(slug))
    assert.deepEqual(missing, [])
  })
})

describe('enrichJob', () => {
  const base = normalizedJobSchema.parse(normalizeFixtureJob({
    id: 'e1',
    title: 'Backend Engineer (Go)',
    company: 'Enrich Co',
    url: 'https://jobs.example.com/e1',
    location: { city: 'Austin', state: 'TX', country: 'US' },
    tags: ['Kafka'],
    description_html: '<p>This is a hybrid role, three days a week in the office. You will write Go services backed by PostgreSQL.</p>'
  }))

  test('adds the technologies of the title and description after the ones the source gave', () => {
    assert.deepEqual(enrichJob(base).technologies, ['kafka', 'go', 'postgresql'])
  })

  test('marks an on-site job hybrid when the description says the role is', () => {
    assert.equal(base.workplace, 'onsite')
    assert.equal(enrichJob(base).workplace, 'hybrid')
  })
})

test('refineWorkplace needs a statement about the role, and never makes a job remote', () => {
  assert.equal(refineWorkplace('onsite', 'We are a hybrid company with offices in three cities.'), 'onsite')
  assert.equal(refineWorkplace('onsite', 'Hybrid schedule: 2 days per week in the office.'), 'hybrid')
  assert.equal(refineWorkplace('onsite', 'This role is fully remote.'), 'onsite')
  assert.equal(refineWorkplace('remote', 'Hybrid role'), 'remote')
})
