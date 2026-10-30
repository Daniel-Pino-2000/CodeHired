import { createApp } from './app.js'
import { CONFIG } from './config.js'
import { runMigrations } from './db/migrations.js'
import { seedJobs } from './db/seed.js'
import { JobModel } from './models/job.js'

const applied = await runMigrations()
if (applied.length > 0) {
  console.log(`Applied migrations: ${applied.join(', ')}`)
}

// First run on a fresh machine: fill the local database so the UI has something to show
if (CONFIG.IS_LOCAL_DATABASE && await JobModel.count() === 0) {
  const inserted = await seedJobs()
  console.log(`Database was empty, seeded ${inserted} jobs`)
}

const app = createApp()

app.listen(CONFIG.PORT, () => {
  console.log(`CodeHired API listening on http://localhost:${CONFIG.PORT}`)
})
