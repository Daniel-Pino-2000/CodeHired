import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import {
  contentHash,
  decodeEntities,
  formatLocation,
  htmlToText,
  inferEmploymentType,
  inferLevel,
  inferWorkplace,
  normalizeTechnologies,
  toWholeNumber
} from '../src/ingest/normalize.js'
import { normalizedJobSchema } from '../src/ingest/schema.js'
import { FIXTURES_DIR, normalizeFixtureJob, type FixtureJob } from '../src/ingest/sources/fixture.js'

const { jobs: FIXTURE_JOBS } = JSON.parse(
  await readFile(new URL('jobs.json', FIXTURES_DIR), 'utf8')
) as { jobs: FixtureJob[] }

function normalizeFixture (id: string) {
  const raw = FIXTURE_JOBS.find((job) => String(job.id) === id)!
  return normalizedJobSchema.parse(normalizeFixtureJob(raw))
}

describe('htmlToText', () => {
  test('keeps paragraphs apart with a blank line and list items on their own line', () => {
    const html = '<p>First   paragraph.</p><h3>Title</h3><ul><li>One</li><li>Two</li></ul>'

    assert.equal(htmlToText(html), 'First paragraph.\n\nTitle\n\n- One\n- Two')
  })

  test('turns <br> into line breaks and drops scripts and styles', () => {
    const html = '<p>Line one<br/>Line two</p><script>alert(1)</script><style>p{}</style>'

    assert.equal(htmlToText(html), 'Line one\nLine two')
  })

  test('decodes entities only after removing tags', () => {
    assert.equal(htmlToText('<p>Tom &amp; Jerry write &lt;b&gt; tags</p>'), 'Tom & Jerry write <b> tags')
  })
})

describe('decodeEntities', () => {
  test('decodes named, decimal and hex entities and leaves unknown ones alone', () => {
    assert.equal(decodeEntities('&quot;a&quot; &#39;b&#39; &#x2014; &bogus;'), '"a" \'b\' — &bogus;')
  })
})

describe('inferLevel', () => {
  const cases: Record<string, string> = {
    'Software Engineering Intern': 'junior',
    'Junior Developer': 'junior',
    'Associate Software Engineer': 'junior',
    'Senior Backend Engineer': 'senior',
    'Sr. Data Engineer': 'senior',
    'Staff Engineer': 'lead',
    'Senior Staff Engineer': 'lead',
    'Engineering Manager': 'lead',
    'Backend Engineer': 'mid'
  }

  for (const [title, level] of Object.entries(cases)) {
    test(`"${title}" is ${level}`, () => {
      assert.equal(inferLevel(title), level)
    })
  }
})

describe('inferEmploymentType', () => {
  test('recognizes internships, part-time and contract roles, and defaults to full-time', () => {
    assert.equal(inferEmploymentType('Summer Internship'), 'internship')
    assert.equal(inferEmploymentType('Part-time'), 'part-time')
    assert.equal(inferEmploymentType('Contractor'), 'contract')
    assert.equal(inferEmploymentType('Regular'), 'full-time')
  })
})

describe('inferWorkplace', () => {
  test('remote wins, then "hybrid" in the text, otherwise onsite', () => {
    assert.equal(inferWorkplace({ remote: true, text: 'Hybrid' }), 'remote')
    assert.equal(inferWorkplace({ remote: false, text: 'Hybrid (3 days)' }), 'hybrid')
    assert.equal(inferWorkplace({ remote: false }), 'onsite')
  })
})

describe('formatLocation', () => {
  test('formats city and state, remote roles and country-only places', () => {
    assert.equal(formatLocation({ city: 'Austin', state: 'TX', remote: false }), 'Austin, TX')
    assert.equal(formatLocation({ country: 'US', remote: true }), 'Remote (US)')
    assert.equal(formatLocation({ remote: true }), 'Remote')
    assert.equal(formatLocation({ remote: false }), '')
  })
})

describe('normalizeTechnologies', () => {
  test('lowercases, slugs and removes duplicates', () => {
    assert.deepEqual(normalizeTechnologies(['React', ' react ', 'Apache Airflow', '']), ['react', 'apache-airflow'])
  })
})

describe('toWholeNumber', () => {
  test('parses numbers and formatted strings, and treats zero or junk as missing', () => {
    assert.equal(toWholeNumber('175,000'), 175000)
    assert.equal(toWholeNumber(70.5), 71)
    assert.equal(toWholeNumber(0), null)
    assert.equal(toWholeNumber('competitive'), null)
    assert.equal(toWholeNumber(undefined), null)
  })
})

describe('fixture source normalization', () => {
  test('every job in the fixture file is valid', () => {
    for (const raw of FIXTURE_JOBS) {
      const result = normalizedJobSchema.safeParse(normalizeFixtureJob(raw))
      assert.ok(result.success, `job ${raw.id}: ${result.error?.message}`)
    }
  })

  test('maps an onsite hybrid job with salary, tags and an HTML description', () => {
    const job = normalizeFixture('4001')

    assert.equal(job.sourceId, '4001')
    assert.equal(job.sourceUrl, 'https://jobs.example.com/copperline/4001')
    assert.equal(job.location, 'Austin, TX')
    assert.equal(job.country, 'US')
    assert.equal(job.remote, false)
    assert.equal(job.workplace, 'hybrid')
    assert.equal(job.level, 'senior')
    assert.equal(job.employmentType, 'full-time')
    assert.equal(job.salaryMin, 145000)
    assert.equal(job.salaryMax, 175000)
    assert.equal(job.currency, 'USD')
    assert.deepEqual(job.technologies, ['react', 'typescript', 'graphql'])
    assert.match(job.description, /^Copperline builds dashboards for & with public utilities\.\n\nWhat you will do/)
    assert.match(job.descriptionHtml!, /^<p>Copperline/)
    // Offsets are converted to UTC
    assert.equal(job.postedAt, '2026-10-20T14:30:00Z')
  })

  test('maps a remote job without a city', () => {
    const job = normalizeFixture('4002')

    assert.equal(job.location, 'Remote (US)')
    assert.equal(job.remote, true)
    assert.equal(job.workplace, 'remote')
    assert.equal(job.level, 'mid')
    assert.equal(job.city, null)
  })

  test('infers internships and contracts from the title and employment type', () => {
    assert.equal(normalizeFixture('4003').employmentType, 'internship')
    assert.equal(normalizeFixture('4003').level, 'junior')
    assert.equal(normalizeFixture('4005').employmentType, 'contract')
    assert.equal(normalizeFixture('4004').level, 'lead')
    assert.equal(normalizeFixture('4004').postedAt, null)
  })
})

describe('contentHash', () => {
  test('is stable for the same job and changes with any field', () => {
    const job = normalizeFixture('4001')

    assert.equal(contentHash(job), contentHash(normalizeFixture('4001')))
    assert.notEqual(contentHash(job), contentHash({ ...job, salaryMax: 180000 }))
  })
})
