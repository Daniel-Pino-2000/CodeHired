// `pnpm db:seed`: wipe the jobs table and fill it again with the seed data
import { db, initDatabase } from './database.js'
import { seedJobs } from './seed.js'

initDatabase()
db.exec('DELETE FROM jobs')

const inserted = seedJobs()
console.log(`Seeded ${inserted} jobs`)

db.close()
