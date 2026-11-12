import { createApp } from '../src/app.js'
import { initDatabase } from '../src/db/database.js'
import { seedJobs } from '../src/db/seed.js'

// App backed by a freshly created and seeded in-memory database
export function createTestApp () {
  initDatabase()
  seedJobs()
  return createApp()
}
