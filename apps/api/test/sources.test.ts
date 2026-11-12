import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import request from 'supertest'
import { SOURCES } from '../src/ingest/sources/index.js'
import { IngestionRunModel, type RunCounts } from '../src/models/ingestion-run.js'
import type { SourceSummary } from '../src/types.js'
import { createTestApp } from './helpers.js'

const app = await createTestApp()

const NO_JOBS: RunCounts = { fetched: 0, inserted: 0, updated: 0, failed: 0, closed: 0 }

async function recordRun (source: string, status: 'succeeded' | 'failed', finishedAt: string) {
  const id = await IngestionRunModel.start(source, finishedAt)
  await IngestionRunModel.finish(id, { ...NO_JOBS, status, finishedAt, error: null })
}

async function getSources () {
  const res = await request(app).get('/sources')
  assert.equal(res.status, 200)
  return res.body as { updatedAt: string | null, data: SourceSummary[] }
}

describe('GET /sources', () => {
  test('lists every real source with its credit and terms, never the fictional one', async () => {
    const { data } = await getSources()

    assert.deepEqual(data.map((source) => source.id), SOURCES.filter((source) => !source.devOnly).map((source) => source.id))
    assert.ok(!data.some((source) => source.id === 'fixture'))
    for (const source of data) {
      assert.ok(source.name, `${source.id} has a name to credit`)
      assert.match(source.url, /^https:\/\//)
      assert.match(source.termsUrl ?? '', /^https:\/\//, `${source.id} links to its terms`)
    }
  })

  test('has no update date before any run succeeded', async () => {
    const { updatedAt, data } = await getSources()

    assert.equal(updatedAt, null)
    assert.ok(data.every((source) => source.updatedAt === null))
  })

  test('dates each source by its last successful run, and the data by the latest of them', async () => {
    await recordRun('greenhouse', 'succeeded', '2026-11-10T06:00:00Z')
    await recordRun('greenhouse', 'succeeded', '2026-11-11T06:00:00Z')
    await recordRun('lever', 'succeeded', '2026-11-11T12:00:00Z')
    // A later failed run does not make the data fresher
    await recordRun('lever', 'failed', '2026-11-12T00:00:00Z')

    const { updatedAt, data } = await getSources()
    const byId = new Map(data.map((source) => [source.id, source.updatedAt]))

    assert.equal(byId.get('greenhouse'), '2026-11-11T06:00:00Z')
    assert.equal(byId.get('lever'), '2026-11-11T12:00:00Z')
    assert.equal(byId.get('ashby'), null)
    assert.equal(updatedAt, '2026-11-11T12:00:00Z')
  })
})
