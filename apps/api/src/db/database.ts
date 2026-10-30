import Database from 'better-sqlite3'
import { CONFIG } from '../config.js'

export const db = new Database(CONFIG.DATABASE_PATH)

db.pragma('journal_mode = WAL') // better concurrency for reads while writing
db.pragma('foreign_keys = ON')

export function initDatabase () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      company         TEXT NOT NULL,
      location        TEXT NOT NULL,
      workplace       TEXT NOT NULL CHECK (workplace IN ('remote', 'hybrid', 'onsite')),
      level           TEXT NOT NULL CHECK (level IN ('junior', 'mid', 'senior', 'lead')),
      employment_type TEXT NOT NULL DEFAULT 'full-time',
      salary_min      INTEGER,
      salary_max      INTEGER,
      currency        TEXT NOT NULL DEFAULT 'USD',
      technologies    TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
      description     TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) -- ISO 8601, UTC
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);
  `)
}
