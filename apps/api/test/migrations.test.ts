import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, describe, test } from 'node:test'
import { createClient } from '@libsql/client'
import { runMigrations } from '../src/db/migrations.js'

const tempDirs: string[] = []

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

// A folder of migration files, as a URL with a trailing slash like the real one
async function migrationsDir (files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'codehired-migrations-'))
  tempDirs.push(dir)
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(dir, name), sql)
  }
  return pathToFileURL(dir + '/')
}

async function tableNames (client: ReturnType<typeof createClient>) {
  const { rows } = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  return rows.map((row) => String(row.name))
}

describe('runMigrations', () => {
  test('applies the real migrations and records them', async () => {
    const client = createClient({ url: ':memory:' })

    const applied = await runMigrations(client)

    assert.ok(applied.includes('001_create_jobs.sql'))
    assert.ok((await tableNames(client)).includes('jobs'))
    const { rows } = await client.execute('SELECT version FROM schema_migrations ORDER BY version')
    assert.deepEqual(rows.map((row) => row.version), applied)
  })

  test('002 gives jobs that already exist sensible source defaults', async () => {
    const client = createClient({ url: ':memory:' })
    const realDir = new URL('../src/db/migrations/', import.meta.url)
    const onlyFirst = await migrationsDir({
      '001_create_jobs.sql': await readFile(new URL('001_create_jobs.sql', realDir), 'utf8')
    })
    await runMigrations(client, onlyFirst)
    await client.execute(`
      INSERT INTO jobs (id, title, company, location, workplace, level, description, created_at)
      VALUES ('job-1', 'Engineer', 'Acme', 'Remote', 'remote', 'mid', 'A job created before 002', '2026-01-01T00:00:00Z')
    `)

    assert.deepEqual(await runMigrations(client), ['002_ingestion.sql', '003_dedupe_and_levels.sql'])

    const { rows: [job] } = await client.execute("SELECT * FROM jobs WHERE id = 'job-1'")
    assert.equal(job.source, 'seed')
    assert.equal(job.source_id, 'job-1')
    assert.equal(job.remote, 1)
    assert.equal(job.posted_at, '2026-01-01T00:00:00Z')
    assert.equal(job.description_text, 'A job created before 002')
    assert.ok((await tableNames(client)).includes('ingestion_runs'))
    await assert.rejects(client.execute(`
      INSERT INTO jobs (id, source, source_id, title, company, location, workplace, level, description_text)
      VALUES ('job-2', 'seed', 'job-1', 'Engineer', 'Acme', 'Remote', 'remote', 'mid', 'Same source and source_id')
    `), /UNIQUE/)
  })

  test('003 rebuilds jobs with the intern and staff levels and keeps every row', async () => {
    const client = createClient({ url: ':memory:' })
    const realDir = new URL('../src/db/migrations/', import.meta.url)
    const upTo002 = await migrationsDir(Object.fromEntries(await Promise.all(
      ['001_create_jobs.sql', '002_ingestion.sql'].map(async (file) => [file, await readFile(new URL(file, realDir), 'utf8')])
    )))
    await runMigrations(client, upTo002)
    await client.execute(`
      INSERT INTO jobs (id, source, source_id, title, company, location, workplace, level, description_text, closed_at)
      VALUES ('job-1', 'lever', 'acme:1', 'Engineer', 'Acme', 'Austin, TX', 'onsite', 'lead', 'A job stored before 003', '2026-10-01T00:00:00Z')
    `)

    assert.deepEqual(await runMigrations(client), ['003_dedupe_and_levels.sql'])

    const { rows: [job] } = await client.execute("SELECT * FROM jobs WHERE id = 'job-1'")
    assert.deepEqual(
      [job.source, job.source_id, job.level, job.closed_at, job.fingerprint, job.duplicate_of],
      ['lever', 'acme:1', 'lead', '2026-10-01T00:00:00Z', null, null]
    )
    for (const level of ['intern', 'staff']) {
      await client.execute({
        sql: "INSERT INTO jobs (id, title, company, location, workplace, level, description_text) VALUES (?, 'Engineer', 'Acme', 'Remote', 'remote', ?, 'A new level')",
        args: [`job-${level}`, level]
      })
    }
    await assert.rejects(client.execute(`
      INSERT INTO jobs (id, title, company, location, workplace, level, description_text)
      VALUES ('job-x', 'Engineer', 'Acme', 'Remote', 'remote', 'principal', 'Not a level')
    `), /CHECK/)
    await assert.rejects(client.execute(`
      INSERT INTO jobs (id, source, source_id, title, company, location, workplace, level, description_text)
      VALUES ('job-y', 'lever', 'acme:1', 'Engineer', 'Acme', 'Remote', 'remote', 'mid', 'The unique index survived')
    `), /UNIQUE/)
    assert.ok((await tableNames(client)).includes('job_sources'))
    const { rows: [run] } = await client.execute("INSERT INTO ingestion_runs (source, started_at) VALUES ('lever', '2026-10-30T00:00:00Z') RETURNING closed")
    assert.equal(run.closed, 0)
  })

  test('is idempotent: a second run applies nothing', async () => {
    const client = createClient({ url: ':memory:' })

    await runMigrations(client)

    assert.deepEqual(await runMigrations(client), [])
  })

  test('applies files in numeric order and skips files that are not migrations', async () => {
    const client = createClient({ url: ':memory:' })
    const dir = await migrationsDir({
      '002_add_b.sql': 'ALTER TABLE a ADD COLUMN b TEXT; -- needs 001 first',
      '001_create_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY)',
      'README.md': 'not a migration'
    })

    assert.deepEqual(await runMigrations(client, dir), ['001_create_a.sql', '002_add_b.sql'])
  })

  test('rolls back a failing migration and stops there', async () => {
    const client = createClient({ url: ':memory:' })
    const dir = await migrationsDir({
      '001_create_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
      '002_broken.sql': 'CREATE TABLE b (id INTEGER PRIMARY KEY); THIS IS NOT SQL;',
      '003_create_c.sql': 'CREATE TABLE c (id INTEGER PRIMARY KEY);'
    })

    await assert.rejects(runMigrations(client, dir), /Migration 002_broken.sql failed/)

    const tables = await tableNames(client)
    assert.ok(tables.includes('a'))
    assert.ok(!tables.includes('b'), 'the half-applied migration was rolled back')
    assert.ok(!tables.includes('c'), 'later migrations did not run')
    const { rows } = await client.execute('SELECT version FROM schema_migrations')
    assert.deepEqual(rows.map((row) => row.version), ['001_create_a.sql'])
  })
})
