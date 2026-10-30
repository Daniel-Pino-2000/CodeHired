import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
