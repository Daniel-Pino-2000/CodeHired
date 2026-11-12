-- Companies, so jobs can be grouped by employer. Filled after every ingestion run and seed
-- (CompanyModel.linkJobs): the companies of companies.json with their website and ATS, plus every
-- other company a job names, matched on the same normalized name the deduplication uses.
CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,  -- /companies/{slug}
  name_key    TEXT NOT NULL UNIQUE,  -- fingerprintCompany(name): "Acme, Inc." and "ACME" are one company
  website     TEXT,
  logo_url    TEXT,
  ats         TEXT,                  -- 'greenhouse', 'lever', 'ashby' for the boards CodeHired reads
  size        TEXT,
  description TEXT
);

ALTER TABLE jobs ADD COLUMN company_id INTEGER REFERENCES companies (id);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs (company_id);
