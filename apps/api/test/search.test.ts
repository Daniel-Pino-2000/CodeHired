import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, describe, test } from 'node:test'
import request from 'supertest'
import { db } from '../src/db/database.js'
import { ingestSource } from '../src/ingest/runner.js'
import { createFixtureSource, type FixtureJob } from '../src/ingest/sources/fixture.js'
import { JobModel } from '../src/models/job.js'
import type { Job, Paginated } from '../src/types.js'
import { toFtsQuery } from '../src/utils/search.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const job = (title: string, overrides: Partial<Parameters<typeof JobModel.create>[0]> = {}) => ({
  title,
  company: 'Searchco',
  location: 'Remote',
  workplace: 'remote' as const,
  level: 'mid' as const,
  employmentType: 'full-time' as const,
  salaryMin: null,
  salaryMax: null,
  currency: 'USD',
  technologies: [],
  description: 'A job written for the full-text search tests, with nothing special in it.',
  ...overrides
})

async function search (query: Record<string, string>) {
  const res = await request(app).get('/jobs').query({ limit: 50, ...query })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body as Paginated<Job>
}
const titles = async (query: Record<string, string>) => (await search(query)).data.map((listed) => listed.title)

// How many jobs the index finds for an FTS5 query, whatever is listed
async function indexed (match: string) {
  const { rows } = await db.execute({ sql: 'SELECT COUNT(*) AS total FROM jobs_fts WHERE jobs_fts MATCH ?', args: [match] })
  return Number(rows[0].total)
}

const tempDirs: string[] = []
after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('toFtsQuery', () => {
  test('quotes every word, so FTS5 operators and syntax are just words', () => {
    assert.equal(toFtsQuery('NOT react OR vue'), '"NOT"* "react"* "OR" "vue"*')
    assert.equal(toFtsQuery('title:rust NEAR(go)'), '"title rust"* "NEAR go"*')
    assert.equal(toFtsQuery('"unbalanced quote'), '"unbalanced"* "quote"*')
  })

  test('keeps the characters of technology names and splits the rest like the tokenizer', () => {
    assert.equal(toFtsQuery('C++ C# node.js'), '"C++"* "C#" "node.js"*')
    assert.equal(toFtsQuery("full-stack women's"), '"full-stack"* "women s"*')
  })

  test('words of 3+ characters, and words typed with *, match longer words; short ones only themselves', () => {
    assert.equal(toFtsQuery('front dev'), '"front"* "dev"*')
    assert.equal(toFtsQuery('go ai ui'), '"go" "ai" "ui"')
    assert.equal(toFtsQuery('go* typescr'), '"go"* "typescr"*')
  })

  test('null when nothing is searchable', () => {
    assert.equal(toFtsQuery('!!! ... --'), null)
    assert.equal(toFtsQuery(''), null)
  })
})

describe('GET /jobs text search (FTS5)', () => {
  test('ranks a match in the title above a match in the description', async () => {
    await JobModel.create(job('Backend Engineer', { description: 'Our platform team writes Zanzibarian services all day long.' }))
    await JobModel.create(job('Zanzibarian Platform Engineer'))

    assert.deepEqual(await titles({ text: 'zanzibarian', sort: 'relevance' }), ['Zanzibarian Platform Engineer', 'Backend Engineer'])
  })

  test('other sorts keep their order on the matching jobs', async () => {
    const results = await search({ text: 'zanzibarian', sort: 'newest' })
    const dates = results.data.map((listed) => listed.createdAt)
    assert.equal(results.total, 2)
    assert.deepEqual(dates, dates.toSorted().reverse())
  })

  test('relevance without text is newest first', async () => {
    const dates = (await search({ sort: 'relevance' })).data.map((listed) => listed.createdAt)
    assert.deepEqual(dates, dates.toSorted().reverse())
  })

  test('matches word prefixes, every word, any case and accents', async () => {
    await JobModel.create(job('Quokkaform Developer', { company: 'Café Lumière' }))

    assert.deepEqual(await titles({ text: 'quokkaf' }), ['Quokkaform Developer'])
    assert.deepEqual(await titles({ text: 'QUOKKAFORM developer' }), ['Quokkaform Developer'])
    assert.deepEqual(await titles({ text: 'quokkaform designer' }), [], 'every word must match')
    assert.deepEqual(await titles({ text: 'cafe lumiere' }), ['Quokkaform Developer'])
  })

  test('a short word matches only itself: "go" does not find "Google"', async () => {
    await JobModel.create(job('Go Kangaroo Engineer'))
    await JobModel.create(job('Kangaroo Engineer at Google', { company: 'Google' }))

    assert.deepEqual(await titles({ text: 'go kangaroo' }), ['Go Kangaroo Engineer'])
    assert.equal((await titles({ text: 'goo kangaroo' })).length, 1, 'three letters are a prefix')
  })

  test('finds technologies and keeps C++ apart from C', async () => {
    await JobModel.create(job('Systems Programmer', { technologies: ['c++'], description: 'Low-latency trading systems written in C++ and Rust, deployed on bare metal.' }))
    await JobModel.create(job('Firmware Programmer', { description: 'Embedded firmware written in plain C for tiny devices and sensors.' }))

    assert.deepEqual(await titles({ text: 'c++ programmer' }), ['Systems Programmer'])
  })

  test('text that looks like FTS5 syntax is searched as words, never an error', async () => {
    for (const text of ['"', 'title:', 'a OR', 'NEAR(', '*', 'zanzibarian)', '-zanzibarian', '^foo']) {
      const res = await request(app).get('/jobs').query({ text })
      assert.equal(res.status, 200, text)
    }
    assert.equal((await search({ text: '!!!' })).total, (await search({})).total, 'nothing searchable filters nothing')
  })

  test('combines with the other filters', async () => {
    await JobModel.create(job('Senior Wombatology Engineer', { level: 'senior' }))
    await JobModel.create(job('Wombatology Engineer'))

    assert.deepEqual(await titles({ text: 'wombatology', level: 'senior' }), ['Senior Wombatology Engineer'])
    assert.deepEqual(await titles({ text: 'wombatology', company: 'searchco', sort: 'relevance', level: 'senior' }), ['Senior Wombatology Engineer'])
  })
})

describe('the search index stays in sync', () => {
  test('when a job is updated, and only for the indexed columns', async () => {
    const created = await JobModel.create(job('Narwhalistic Engineer'))
    await db.execute({ sql: "UPDATE jobs SET title = 'Platypoid Engineer' WHERE id = ?", args: [created.id] })

    assert.deepEqual(await titles({ text: 'narwhalistic' }), [])
    assert.deepEqual(await titles({ text: 'platypoid' }), ['Platypoid Engineer'])

    // Touching a job on every run does not rewrite its index entry
    await db.execute({ sql: "UPDATE jobs SET last_seen_at = '2026-11-12T00:00:00Z' WHERE id = ?", args: [created.id] })
    assert.equal(await indexed('platypoid'), 1)
  })

  test('when a job is deleted', async () => {
    const created = await JobModel.create(job('Axolotlian Engineer'))
    assert.equal(await indexed('axolotlian'), 1)

    await db.execute({ sql: 'DELETE FROM jobs WHERE id = ?', args: [created.id] })

    assert.equal(await indexed('axolotlian'), 0)
    assert.deepEqual(await titles({ text: 'axolotlian' }), [])
  })

  test('when ingestion updates a job whose content changed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codehired-search-'))
    tempDirs.push(dir)
    const file = join(dir, 'jobs.json')
    const posting = (title: string): FixtureJob => ({
      id: 'fts-1',
      url: 'https://jobs.example.com/fts/1',
      title,
      company: 'Indexco',
      location: { city: 'Austin', state: 'TX', country: 'US' },
      description_html: '<p>A posting that changes its title between two runs of the source.</p>'
    })
    const source = createFixtureSource(pathToFileURL(file), 'fixture-fts')
    const silent = { info () {}, warn () {}, error () {} }

    await writeFile(file, JSON.stringify({ jobs: [posting('Quetzalcoatl Engineer')] }))
    await ingestSource(source, { logger: silent })
    await writeFile(file, JSON.stringify({ jobs: [posting('Tlaloc Engineer')] }))
    const summary = await ingestSource(source, { logger: silent })

    assert.equal(summary.updated, 1)
    assert.equal(await indexed('quetzalcoatl'), 0)
    assert.equal(await indexed('tlaloc'), 1)
  })
})
