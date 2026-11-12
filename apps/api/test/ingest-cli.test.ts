import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { after, describe, test } from 'node:test'
import { createClient } from '@libsql/client'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../src/ingest/cli.ts', import.meta.url))
const API_DIR = fileURLToPath(new URL('..', import.meta.url))

const dir = await mkdtemp(join(tmpdir(), 'codehired-cli-'))
const databaseUrl = `file:${join(dir, 'ingest.db').replaceAll('\\', '/')}`

// Windows can keep the database file locked for a moment after the client closes it
after(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
})

// The real entry point of `pnpm ingest`, in its own process with a throwaway database file
function ingest (...args: string[]) {
  return run(process.execPath, ['--import', 'tsx', CLI, ...args], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: API_DIR
  })
}

describe('pnpm ingest', () => {
  test('--source=fixture twice inserts the jobs once and records two runs', async () => {
    const first = await ingest('--source=fixture')
    const second = await ingest('--source=fixture')

    assert.match(first.stdout, /fixture: fetched 5, inserted 5, updated 0, unchanged 0, skipped 0/)
    assert.match(second.stdout, /fixture: fetched 5, inserted 0, updated 0, unchanged 5, skipped 0/)

    const client = createClient({ url: databaseUrl })
    const jobs = await client.execute("SELECT COUNT(*) AS total FROM jobs WHERE source = 'fixture'")
    const runs = await client.execute("SELECT status FROM ingestion_runs WHERE source = 'fixture'")
    client.close()
    assert.equal(Number(jobs.rows[0].total), 5)
    assert.deepEqual(runs.rows.map((row) => row.status), ['succeeded', 'succeeded'])
  })

  test('--dry-run says so and writes nothing', async () => {
    const { stdout } = await ingest('--source=fixture', '--dry-run')

    assert.match(stdout, /Dry run, nothing written/)
    const client = createClient({ url: databaseUrl })
    const runs = await client.execute("SELECT COUNT(*) AS total FROM ingestion_runs WHERE source = 'fixture'")
    client.close()
    assert.equal(Number(runs.rows[0].total), 2)
  })

  test('exits with an error for an unknown source', async () => {
    await assert.rejects(ingest('--source=nope'), (error: { code: number, stderr: string }) => {
      assert.equal(error.code, 2)
      assert.match(error.stderr, /Unknown source "nope"/)
      return true
    })
  })
})
