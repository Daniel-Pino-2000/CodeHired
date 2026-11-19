-- Candidate accounts (#10). `email` is stored trimmed and lowercased, and `password_hash` is an
-- argon2id hash in PHC format: the password itself is never stored. `employer` is reserved for
-- employer accounts (#12). Numbered 008 so it never collides with 005 (FTS5).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate', 'employer')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
