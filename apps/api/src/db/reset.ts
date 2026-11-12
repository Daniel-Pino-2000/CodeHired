// `pnpm db:seed`: wipe the jobs table and fill it again with the seed data
import { CONFIG } from '../config.js'
import { db } from './database.js'
import { runMigrations } from './migrations.js'
import { seedJobs } from './seed.js'

// Demo data is for development and tests only: never wipe a hosted database
if (!CONFIG.IS_LOCAL_DATABASE) {
  console.error(`Refusing to seed ${CONFIG.DATABASE_URL}: only local databases can be seeded`)
  process.exit(1)
}

await runMigrations()
await db.execute('DELETE FROM jobs')

const inserted = await seedJobs()
console.log(`Seeded ${inserted} jobs`)

db.close()
