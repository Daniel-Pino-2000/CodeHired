import { createApp } from '../src/app.js'
import { runMigrations } from '../src/db/migrations.js'
import { seedJobs } from '../src/db/seed.js'

// App backed by a freshly migrated and seeded in-memory database
export async function createTestApp () {
  await runMigrations()
  await seedJobs()
  return createApp()
}
