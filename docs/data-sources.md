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
- **Credit the company.** The company name comes from [`companies.json`](../apps/api/src/ingest/companies.json), not from the board, and is shown on every job. The `Source.attribution` of each adapter ("Greenhouse", "Lever", "Ashby") is shown as "via ..." on job cards and "Found on ..." on the job page.
- **Be a light client.** One full run a day at most. The shared HTTP client (`apps/api/src/ingest/http.ts`) sends a `User-Agent` that names CodeHired and links this repository, keeps at most 4 requests in flight per platform, times out after 15 seconds and backs off exponentially on `429` and `5xx`, honoring `Retry-After`. One request per company board: the list endpoints return every posting at once, so no per-job requests are made.
- **Keep only what we list.** Postings outside the US (and not open to US-based remote applicants), and non-tech roles, are dropped before they reach the database.
- **Drop what disappears.** A job that the last 3 runs did not see is closed (hidden from the site) and deleted 60 days later, so CodeHired does not keep advertising filled roles.
- **Respect opt-outs.** A company that asks not to be listed is removed from `companies.json` and its jobs are deleted.

### Notes per platform

- **Greenhouse** escapes the HTML of `content` (`&lt;p&gt;`), so the adapter decodes it before turning it into text. Pay ranges come from `pay_input_ranges` with `pay_transparency=true`; the docs only list that parameter for single jobs, but the list endpoint honors it too. If it stops doing so, jobs simply have no salary.
- **Lever** returns a bare array. `salaryRange` is used only when its `interval` is `per-year-salary`. `country` describes the main location only.
- **Ashby** needs `includeCompensation=true` for salaries; only `Salary` components with a `1 YEAR` interval are used. `workplaceType` is trusted over `isRemote`, which hybrid roles also set.
- On every platform, only yearly US dollar ranges are stored. A range in another currency belongs to a non-US location of the same posting.

## Remote job boards

Boards that list remote jobs from many companies. Their terms differ a lot, so each one was read before enabling it. They rank below company boards: when a job is on both, the company's own posting is listed (see Deduplication in the README).

| Source (`pnpm ingest --source=`) | API | Terms | Attribution rule | Limits |
| --- | --- | --- | --- | --- |
| `remoteok` | `GET remoteok.com/api`: the whole feed in one request, no key | The legal notice is the first element of the feed itself | Link back to the job's URL on Remote OK **with a followed link** (no `rel="nofollow"`), and name Remote OK as the source. The name may be used, the logo may not (registered trademark) | None stated; one request per run |
| `himalayas` | `GET himalayas.app/jobs/api/search?q=…&country=US&sort=recent&page=N`, no key | [API terms](https://himalayas.app/terms) (API section) and the [API page](https://himalayas.app/api): display on our own sites is allowed without asking | Name Himalayas as the source with a visible link to the job or to himalayas.app. Every Apply link must use `applicationLink` **unchanged** (that is our `source_url`). Show the jobs only on sites we operate; **never pass them on**: no feeds, no Google Jobs or LinkedIn, no `JobPosting` structured data for these jobs. Remove expired jobs | Keyless calls share one public allowance (with a free key: 60/minute, 10,000/day). The data refreshes daily. We send one request at a time: 5 queries × up to 5 pages, about 25 requests a run. Jobs past `expiryDate` are skipped |
| `jobicy` | `GET jobicy.com/api/jobs?count=100&geo=usa` with `cursor` pagination, no key | [API and feed page](https://jobicy.com/jobs-rss-feed): commercial use, job boards and aggregators are allowed | Credit Jobicy as the source; apply links from the free API must keep pointing to the job's page on Jobicy (our `source_url`); never present the listings as our own | Sync at most once an hour; handle `429`. Only the last 7 days of jobs are served. One request at a time, 10 pages at most |

### What these boards require of the UI

- Every job from these boards shows its source by name ("via Remote OK" on the card) and links to the job's page on that board ("Found on Remote OK" on the job page). The link is a plain followed link: `target="_blank" rel="noopener noreferrer"`, never `nofollow`.
- No third-party logos.
- When an "Apply" button replaces today's placeholder (#32), it must point to `source_url`. For Himalayas that is the unchanged `applicationLink`; for Jobicy, the Jobicy page.
- If CodeHired ever adds `JobPosting` structured data or a public feed, it must leave out Himalayas jobs.

## Not enabled

| Source | Why |
| --- | --- |
| LinkedIn, Indeed, ZipRecruiter | No public API for this use, and their terms forbid scraping. Their postings mostly come from the same company ATS boards anyway |
| [Remotive](https://github.com/remotive-com/remote-jobs-api) | Its terms forbid submitting its jobs to third-party websites and treat using the listings to collect signups or emails as a violation. CodeHired plans user accounts and email alerts for new jobs (see the roadmap), so it does not qualify. Jobs are also delayed by 24 hours, and the feed may be fetched only a few times a day. Remotive sells a private API for other uses |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | No terms of use, attribution rules or limits are published, so there is nothing to show that this use is allowed. Its jobs are mostly in Europe and come from ATS boards (Greenhouse among them) that CodeHired can read directly |
| We Work Remotely | Excluded by #30: its API terms prohibit building job search services on its data |
