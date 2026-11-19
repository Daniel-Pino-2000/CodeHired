-- The application deadline a source states (USAJobs' `ApplicationCloseDate`), in UTC. A job is
-- no longer listed once it has passed, and the next run of its source closes it (`closed_at`).
-- Numbered 007 so it never collides with 005 (FTS5).
ALTER TABLE jobs ADD COLUMN closes_at TEXT;
