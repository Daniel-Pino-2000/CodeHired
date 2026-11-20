-- Applications a candidate tracks (#14): to a CodeHired job, or to one found elsewhere and added
-- by hand (`job_id` NULL). The company, title, link and where they applied are copied from the
-- job when it is recorded, so the application outlives the job: when ingestion deletes a job that
-- closed long ago, `job_id` goes back to NULL and the rest stays. Dates the candidate picks
-- (`applied_at`, `follow_up_at`) are calendar dates, YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS applications (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id       TEXT REFERENCES jobs (id) ON DELETE SET NULL,
  company      TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT,
  -- Where they applied: the site that published the job ("LinkedIn", "Greenhouse"), or what they typed
  source       TEXT,
  status       TEXT NOT NULL DEFAULT 'applied'
               CHECK (status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  notes        TEXT NOT NULL DEFAULT '',
  applied_at   TEXT,
  follow_up_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- A CodeHired job is recorded once per user; manual entries can repeat
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_job ON applications (user_id, job_id) WHERE job_id IS NOT NULL;

-- GET /me/applications lists by user; deleting a job looks its applications up by job
CREATE INDEX IF NOT EXISTS idx_applications_user_updated ON applications (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id) WHERE job_id IS NOT NULL;
