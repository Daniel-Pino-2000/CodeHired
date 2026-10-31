-- Levels 'intern' and 'staff', deduplication across sources, and how many jobs each run closed.

-- SQLite cannot change a CHECK constraint in place, so `jobs` is rebuilt with the new levels.
-- The two new columns are added at the same time.
CREATE TABLE jobs_new (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  company          TEXT NOT NULL,
  location         TEXT NOT NULL,
  workplace        TEXT NOT NULL CHECK (workplace IN ('remote', 'hybrid', 'onsite')),
  level            TEXT NOT NULL CHECK (level IN ('intern', 'junior', 'mid', 'senior', 'staff', 'lead')),
  employment_type  TEXT NOT NULL DEFAULT 'full-time',
  salary_min       INTEGER,
  salary_max       INTEGER,
  currency         TEXT NOT NULL DEFAULT 'USD',
  technologies     TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  description_text TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), -- ISO 8601, UTC
  source           TEXT NOT NULL DEFAULT 'seed',
  source_id        TEXT,
  source_url       TEXT,    -- the original posting, where users apply
  publisher        TEXT,    -- who published it, e.g. "LinkedIn" through JSearch
  remote           INTEGER NOT NULL DEFAULT 0 CHECK (remote IN (0, 1)),
  city             TEXT,
  state            TEXT,
  country          TEXT,    -- ISO 3166-1 alpha-2, e.g. "US"
  posted_at        TEXT,
  last_seen_at     TEXT,
  closed_at        TEXT,
  content_hash     TEXT,    -- sha256 of the normalized job, to skip no-op updates
  description_html TEXT,
  fingerprint      TEXT,    -- normalized company | title | place: equal for the same opening on two sources
  duplicate_of     TEXT     -- the canonical job, when this row is the same opening from a lower-priority source
);

INSERT INTO jobs_new (id, title, company, location, workplace, level, employment_type, salary_min,
                      salary_max, currency, technologies, description_text, created_at, source,
                      source_id, source_url, publisher, remote, city, state, country, posted_at,
                      last_seen_at, closed_at, content_hash, description_html)
SELECT id, title, company, location, workplace, level, employment_type, salary_min,
       salary_max, currency, technologies, description_text, created_at, source,
       source_id, source_url, publisher, remote, city, state, country, posted_at,
       last_seen_at, closed_at, content_hash, description_html
FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source ON jobs (source, source_id);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs (fingerprint);

-- Every place a listed job appears, the canonical job included. Rebuilt after each ingestion
-- from `jobs.fingerprint` and `jobs.duplicate_of`, so the UI can say "also on Adzuna".
CREATE TABLE IF NOT EXISTS job_sources (
  job_id       TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE, -- the canonical job
  source       TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  source_url   TEXT,
  publisher    TEXT,
  last_seen_at TEXT,
  PRIMARY KEY (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_job_sources_job ON job_sources (job_id);

ALTER TABLE ingestion_runs ADD COLUMN closed INTEGER NOT NULL DEFAULT 0; -- jobs this run closed
