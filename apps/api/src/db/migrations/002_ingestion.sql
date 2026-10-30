-- Columns for jobs collected from external sources (`pnpm ingest`). Rows that already exist are
-- the fictional seed jobs, so they get `source = 'seed'` and their own id as `source_id`.
ALTER TABLE jobs ADD COLUMN source TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE jobs ADD COLUMN source_id TEXT;
ALTER TABLE jobs ADD COLUMN source_url TEXT;       -- the original posting, where users apply
ALTER TABLE jobs ADD COLUMN publisher TEXT;        -- who published it, e.g. "LinkedIn" through JSearch
ALTER TABLE jobs ADD COLUMN remote INTEGER NOT NULL DEFAULT 0 CHECK (remote IN (0, 1));
ALTER TABLE jobs ADD COLUMN city TEXT;
ALTER TABLE jobs ADD COLUMN state TEXT;
ALTER TABLE jobs ADD COLUMN country TEXT;          -- ISO 3166-1 alpha-2, e.g. "US"
ALTER TABLE jobs ADD COLUMN posted_at TEXT;
ALTER TABLE jobs ADD COLUMN last_seen_at TEXT;
ALTER TABLE jobs ADD COLUMN closed_at TEXT;
ALTER TABLE jobs ADD COLUMN content_hash TEXT;     -- sha256 of the normalized job, to skip no-op updates
ALTER TABLE jobs ADD COLUMN description_html TEXT;

-- The plain-text description already exists: rename it instead of keeping two copies
ALTER TABLE jobs RENAME COLUMN description TO description_text;

UPDATE jobs
SET source_id    = id,
    remote       = workplace = 'remote',
    posted_at    = created_at,
    last_seen_at = created_at
WHERE source_id IS NULL;

-- SQLite cannot add a UNIQUE constraint with ALTER TABLE; a unique index does the same job
-- and is what `INSERT ... ON CONFLICT (source, source_id)` matches against
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source ON jobs (source, source_id);

-- One row per source per `pnpm ingest`, written when the run starts and completed when it ends
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  fetched     INTEGER NOT NULL DEFAULT 0,
  inserted    INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0, -- jobs skipped: invalid, or listed twice in one run
  error       TEXT                        -- why the run itself failed, if it did
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs (source, started_at DESC);
