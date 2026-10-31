# Data sources

Every place CodeHired takes jobs from, what its terms allow, and the rules we follow for it. A source is only enabled after its terms are reviewed here. CodeHired never scrapes job sites (LinkedIn, Indeed, ZipRecruiter and the like): it only reads official or public APIs.

Reviewed on 2026-10-30. Terms change: check them again before relying on this page for a new use.

## Enabled sources

| Source (`pnpm ingest --source=`) | API | Terms | Attribution rule | Limits |
| --- | --- | --- | --- | --- |
| `greenhouse` | Job Board API: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | [Job Board API docs](https://developers.greenhouse.io/job-board.html): "Job Board data is publicly available, so authentication is not required for any GET endpoints". No API-specific terms are published for these endpoints | None stated. We link every job to its posting on the company's board and name the company | None stated |
| `lever` | Postings API: `GET api.lever.co/v0/postings/{company}?mode=json` | [Postings API docs](https://github.com/lever/postings-api): published postings are public and need no key for `GET`. No terms of use beyond the docs | None stated. We link every job to its hosted posting (`jobs.lever.co`) and name the company | Only application `POST`s are rate limited (2 per second). We never post applications |
| `ashby` | Job Postings API: `GET api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` | [Job Postings API docs](https://developers.ashbyhq.com/docs/public-job-posting-api): returns every published posting of a board, no key. No terms of use beyond the docs | None stated. We link every job to its posting (`jobs.ashbyhq.com`) and name the company | None stated |

These three APIs exist so companies can show their own openings on their own sites, and the postings are public by design: Lever's docs note that published jobs "may be scraped by third parties". CodeHired uses them only to point candidates at the original posting.

### Rules we follow for every ATS board

- **Link back, never re-host the application.** Every job keeps `source_url`, and the UI must send candidates there to apply. CodeHired never submits applications through these APIs.
- **Credit the company.** The company name comes from [`companies.json`](../apps/api/src/ingest/companies.json), not from the board, and is shown on every job. The `Source.attribution` of each adapter ("Greenhouse", "Lever", "Ashby") is there for a "via ..." line in the UI (#32).
- **Be a light client.** One full run a day at most. The shared HTTP client (`apps/api/src/ingest/http.ts`) sends a `User-Agent` that names CodeHired and links this repository, keeps at most 4 requests in flight per platform, times out after 15 seconds and backs off exponentially on `429` and `5xx`, honoring `Retry-After`. One request per company board: the list endpoints return every posting at once, so no per-job requests are made.
- **Keep only what we list.** Postings outside the US (and not open to US-based remote applicants), and non-tech roles, are dropped before they reach the database.
- **Drop what disappears.** A job no longer on its board must be closed and later deleted (expiry lands with #31), so CodeHired does not keep advertising filled roles.
- **Respect opt-outs.** A company that asks not to be listed is removed from `companies.json` and its jobs are deleted.

### Notes per platform

- **Greenhouse** escapes the HTML of `content` (`&lt;p&gt;`), so the adapter decodes it before turning it into text. Pay ranges come from `pay_input_ranges` with `pay_transparency=true`; the docs only list that parameter for single jobs, but the list endpoint honors it too. If it stops doing so, jobs simply have no salary.
- **Lever** returns a bare array. `salaryRange` is used only when its `interval` is `per-year-salary`. `country` describes the main location only.
- **Ashby** needs `includeCompensation=true` for salaries; only `Salary` components with a `1 YEAR` interval are used. `workplaceType` is trusted over `isRemote`, which hybrid roles also set.
- On every platform, only yearly US dollar ranges are stored. A range in another currency belongs to a non-US location of the same posting.

## Not enabled

| Source | Why |
| --- | --- |
| LinkedIn, Indeed, ZipRecruiter | No public API for this use, and their terms forbid scraping. Their postings mostly come from the same company ATS boards anyway |
