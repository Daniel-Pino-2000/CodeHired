// `pnpm db:migrate`: apply pending migrations to the database in DATABASE_URL
import { db } from './database.js'
import { runMigrations } from './migrations.js'

const applied = await runMigrations()
console.log(applied.length > 0 ? `Applied ${applied.join(', ')}` : 'Database is up to date')

db.close()
