import { createApp } from './app.js'
import { CONFIG } from './config.js'
import { initDatabase } from './db/database.js'
import { seedJobs } from './db/seed.js'
import { JobModel } from './models/job.js'

initDatabase()

// First run on a fresh machine: fill the database so the UI has something to show
if (JobModel.count() === 0) {
  const inserted = seedJobs()
  console.log(`Database was empty, seeded ${inserted} jobs`)
}

const app = createApp()

app.listen(CONFIG.PORT, () => {
  console.log(`CodeHired API listening on http://localhost:${CONFIG.PORT}`)
})
