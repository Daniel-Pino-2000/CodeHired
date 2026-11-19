-- Jobs a candidate saved (#13). One row per user and job. A save goes away with its job when
-- ingestion deletes jobs that closed long ago, and with its user. libSQL enforces foreign keys.
CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id     TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_id, job_id)
) WITHOUT ROWID;

-- Deleting a job looks up its saves by job
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id ON saved_jobs (job_id);
