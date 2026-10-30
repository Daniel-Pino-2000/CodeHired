import { readdir, readFile } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import { db } from './database.js'

// Copied next to the compiled code by the build script
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)

// Files are named `NNN_description.sql` and applied in that order
const MIGRATION_FILE = /^\d{3}_[\w-]+\.sql$/

// Applies every migration that is not in `schema_migrations` yet. Returns the versions applied.
export async function runMigrations (client: Client = db, dir: URL = MIGRATIONS_DIR) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `)

  const { rows } = await client.execute('SELECT version FROM schema_migrations')
  const applied = new Set(rows.map((row) => String(row.version)))

  const files = (await readdir(dir)).filter((file) => MIGRATION_FILE.test(file)).sort()
  const pending = files.filter((file) => !applied.has(file))

  for (const file of pending) {
    const sql = await readFile(new URL(file, dir), 'utf8')

    // One script with its own BEGIN/COMMIT: a failing migration leaves no trace. An interactive
    // `client.transaction()` is avoided on purpose: locally it hands over the connection, which
    // would leave an in-memory database empty for the next query.
    try {
      await client.executeMultiple([
        'BEGIN;',
        sql,
        `;INSERT INTO schema_migrations (version) VALUES ('${file}');`,
        'COMMIT;'
      ].join('\n'))
    } catch (error) {
      await client.execute('ROLLBACK').catch(() => {})
      throw new Error(`Migration ${file} failed`, { cause: error })
    }
  }

  return pending
}
