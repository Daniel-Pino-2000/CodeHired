-- A candidate's profile (#15): one row per user, created by the first PUT /me/profile. `skills`
-- is a JSON array of technology slugs from packages/shared/technologies.json, the same ones jobs
-- are tagged with, so "Jobs for you" can search by them. The resume is a link (a Google Drive or
-- Dropbox file, a personal site): files are not stored here.
CREATE TABLE IF NOT EXISTS profiles (
  user_id           INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  headline          TEXT,
  location          TEXT,
  bio               TEXT NOT NULL DEFAULT '',
  skills            TEXT NOT NULL DEFAULT '[]',
  years_experience  INTEGER CHECK (years_experience BETWEEN 0 AND 60),
  desired_level     TEXT CHECK (desired_level IN ('intern', 'junior', 'mid', 'senior', 'staff', 'lead')),
  desired_workplace TEXT CHECK (desired_workplace IN ('remote', 'hybrid', 'onsite')),
  github_url        TEXT,
  linkedin_url      TEXT,
  portfolio_url     TEXT,
  resume_url        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
