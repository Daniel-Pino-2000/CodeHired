-- Full-text search over jobs with SQLite FTS5: ranked (bm25) and much faster than LIKE '%text%'.
-- An external-content index: the text stays in `jobs` only, the index maps words to job rowids.
-- `tokenchars '+#'` keeps "C++" and "C#" whole; `remove_diacritics 2` makes "Bogotá" match "bogota".
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(
  title,
  company,
  description_text,
  technologies,
  content = 'jobs',
  content_rowid = 'rowid',
  tokenize = "unicode61 remove_diacritics 2 tokenchars '+#'"
);

-- Kept in sync by triggers, so every way of writing jobs (ingestion, seed, tests) is covered.
-- The update trigger only fires when an indexed column is written: touching `last_seen_at` on
-- every run, closing jobs and marking duplicates leave the index alone.
CREATE TRIGGER IF NOT EXISTS jobs_fts_after_insert AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts (rowid, title, company, description_text, technologies)
  VALUES (new.rowid, new.title, new.company, new.description_text, new.technologies);
END;

CREATE TRIGGER IF NOT EXISTS jobs_fts_after_delete AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts (jobs_fts, rowid, title, company, description_text, technologies)
  VALUES ('delete', old.rowid, old.title, old.company, old.description_text, old.technologies);
END;

CREATE TRIGGER IF NOT EXISTS jobs_fts_after_update AFTER UPDATE OF title, company, description_text, technologies ON jobs BEGIN
  INSERT INTO jobs_fts (jobs_fts, rowid, title, company, description_text, technologies)
  VALUES ('delete', old.rowid, old.title, old.company, old.description_text, old.technologies);
  INSERT INTO jobs_fts (rowid, title, company, description_text, technologies)
  VALUES (new.rowid, new.title, new.company, new.description_text, new.technologies);
END;

-- Index the jobs that already exist
INSERT INTO jobs_fts (jobs_fts) VALUES ('rebuild');
