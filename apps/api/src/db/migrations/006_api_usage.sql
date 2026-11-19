-- Calls made to sources with a request quota (Adzuna, JSearch), counted per period so a run can
-- stop before the quota is used up. `period` is the UTC day (`2026-11-19`), ISO week (`2026-W47`)
-- or month (`2026-11`) the calls were made in. Numbered 006 so it never collides with 005 (FTS5).
CREATE TABLE IF NOT EXISTS api_usage (
  source TEXT NOT NULL,
  period TEXT NOT NULL,
  calls  INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  PRIMARY KEY (source, period)
);
