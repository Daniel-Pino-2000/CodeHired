import { createClient } from '@libsql/client'
import { CONFIG } from '../config.js'

// Same client for a local file, an in-memory database and a hosted Turso database
export const db = createClient({
  url: CONFIG.DATABASE_URL,
  authToken: CONFIG.DATABASE_AUTH_TOKEN
})
