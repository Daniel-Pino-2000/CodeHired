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
- **Be a light client.** One full run a day at most: the scheduled workflow (`pnpm ingest --due`, every 6 hours) skips these sources until 20 hours have passed since their last run, which makes one run a day. The shared HTTP client (`apps/api/src/ingest/http.ts`) sends a `User-Agent` that names CodeHired and links this repository, keeps at most 4 requests in flight per platform, times out after 15 seconds and backs off exponentially on `429` and `5xx`, honoring `Retry-After`. One request per company board: the list endpoints return every posting at once, so no per-job requests are made.
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
| `jobicy` | `GET jobicy.com/api/jobs?count=100&geo=usa` with `cursor` pagination, no key | [API and feed page](https://jobicy.com/jobs-rss-feed): commercial use, job boards and aggregators are allowed | Credit Jobicy as the source; apply links from the free API must keep pointing to the job's page on Jobicy (our `source_url`); never present the listings as our own | Sync at most once an hour (`minHoursBetweenRuns: 1`, so `--due` never runs it twice within an hour; the schedule runs it every 6 hours); handle `429`. Only the last 7 days of jobs are served. One request at a time, 10 pages at most |

### What these boards require of the UI

- Every job from these boards shows its source by name ("via Remote OK" on the card) and links to the job's page on that board ("Found on Remote OK" on the job page). The link is a plain followed link: `target="_blank" rel="noopener noreferrer"`, never `nofollow`.
- No third-party logos.
- The "Apply on …" button on the job page points to `source_url`, unchanged. For Himalayas that is the `applicationLink`; for Jobicy, the Jobicy page.
- The [`/sources`](../apps/web/src/pages/Sources.jsx) page, linked from the footer, names every source and links to it and to its terms (`Source.attribution`). It is served by `GET /sources`, which only lists real sources.
- If CodeHired ever adds `JobPosting` structured data or a public feed, it must leave out Himalayas jobs.

## Government

| Source (`pnpm ingest --source=`) | API | Terms | Attribution rule | Limits |
| --- | --- | --- | --- | --- |
| `usajobs` | Search API: `GET data.usajobs.gov/api/search?JobCategoryCode=2210;1550&ResultsPerPage=500&SortField=opendate&SortDirection=desc&Fields=Full`, with the headers `Authorization-Key` (`USAJOBS_API_KEY`) and `User-Agent` set to the email the key was issued to (`USAJOBS_USER_AGENT`). `Host` is the URL's own host | [Terms of service](https://developer.usajobs.gov/guides/terms-of-service) (reviewed 2026-11-19): the data is public and may be modified, analyzed and redistributed without approval. Never present modified data as official, imply that OPM or an agency endorses CodeHired, claim an application was submitted, share the key, get around the limits or use an agency's seal or logo | Encouraged, not required: name USAJOBS as the source, link to the current official announcement and say that OPM does not endorse the product. We do all three: "via USAJOBS" on every card, "Apply on USAJOBS" links to the announcement (`PositionURI`), and the [`/sources`](../apps/web/src/pages/Sources.jsx) page says that CodeHired is not endorsed by OPM or any agency | [Rate limiting](https://developer.usajobs.gov/guides/rate-limiting): at most 500 rows a page and 10,000 a query; no request quota is published. We send one request at a time, one second apart, at most 20 pages a run. There are usually a few thousand open federal IT jobs, so a run takes a handful of requests |

- **Categories.** 2210 is Information Technology Management, the series of almost every federal software, data and security job; 1550 is Computer Science. Every job of these series is kept (federal IT titles such as "IT Specialist (APPSW)" would fail our title filter), as long as one duty station is in the US.
- **Whole listings.** A run fetches every open announcement, so USAJobs jobs close like a company board's: after 3 runs that did not see them, or 45 days after posting.
- **Deadlines.** `ApplicationCloseDate` is stored as `closes_at` (USAJobs dates are Eastern Time without an offset; we convert them to UTC). The job stops being listed once it has passed, and the next run closes it.
- **Salaries.** Federal postings always state a range; only yearly ones (`RateIntervalCode` `PA`) are stored, hourly wage-grade pay is not.
- **Level and workplace.** The General Schedule grade gives the level (GS-7 and below junior, 9 to 11 mid, 12 and 13 senior, 14 and 15 staff; "Supervisory" titles lead). "Anywhere in the U.S. (remote job)" and `RemoteIndicator` mean remote; `TeleworkEligible` means hybrid.
- **The email stays secret.** The `User-Agent` email is read from the environment (a repository secret), never written in the code or the logs.

## Job search APIs

Aggregators with an official API and a free key. They rank below company boards and USAJobs when the same job is on several sources.

| Source (`pnpm ingest --source=`) | API | Terms | Attribution rule | Limits |
| --- | --- | --- | --- | --- |
| `adzuna` | `GET api.adzuna.com/v1/api/jobs/us/search/{page}?category=it-jobs&results_per_page=50&max_days_old=2&sort_by=date`, with `app_id` and `app_key` (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`) | [Terms of service](https://developer.adzuna.com/docs/terms_of_service) (reviewed 2026-11-19): publishing Adzuna listings is a permitted use; no resale of the data, no sales prospecting or lead generation, never contact the advertisers, one account per person. The free key is meant for evaluation; commercial use beyond a trial needs a licence. CodeHired is a non-commercial portfolio project | Every advert shown is labelled "Adzuna", at least 116 x 23 pixels, linked to adzuna.com: the "Jobs by Adzuna" badge on each card and job page (`Attribution.credit`). Salary estimates would need "Adzuna Jobsworth" credit, so we drop salaries Adzuna predicted (`salary_is_predicted`) | Defaults: 25 calls a minute, 250 a day, 1,000 a week, 2,500 a month. Our budget (`ADZUNA_BUDGET`): **80 a day**, 900 a week, 2,400 a month, counted in `api_usage` before each call; a run stops when any is reached. One call every 3 seconds, at most 20 pages (1,000 jobs) a run |
| `jsearch` | JSearch by OpenWeb Ninja: `GET api.openwebninja.com/jsearch/search-v2?query={role} jobs in the United States&num_pages=1&country=us&date_posted=today`, with the header `x-api-key` (`JSEARCH_API_KEY`). It returns Google for Jobs results: postings from LinkedIn, Indeed, ZipRecruiter, Glassdoor, company sites and others | [Terms of service](https://www.openwebninja.com/terms) (last updated 2026-10-14, reviewed 2026-11-19), section 2: the API data may be used, reproduced and commercially exploited in our own products; it may not be resold or redistributed as a standalone data or API product, nor used to build a substitute for the API. The data comes from third-party sites, and we answer for following their terms and the law | None required by OpenWeb Ninja. Each job names the site that published it (`job_publisher`, our `publisher`): "via LinkedIn" on the card, "Apply on LinkedIn" on the job page, linking to `job_apply_link` (our `source_url`), so candidates apply on the original posting | Free plan: **200 requests a month**, a hard limit; each request returns one page of up to 10 jobs and costs one credit. Our budget (`JSEARCH_BUDGET`): **6 a day** and **190 a month**, counted in `api_usage` before each call. One run a day (`minHoursBetweenRuns: 20`) sends one request per query, 6 of the 8 queries in `JSEARCH_QUERIES`, rotated daily. No retries: a retried request would spend a credit the budget did not count |

Adzuna:

- **Snippets only.** Adzuna returns the start of the description. We store it (`snippetOnly`), and the job page sends candidates to `redirect_url` (our `source_url`) to read the rest and apply.
- **Partial listings.** A run only sees the last 2 days of postings, so Adzuna jobs are closed for their age (45 days), never for missing from a run (`seesOnlyRecentJobs`).
- **The key stays secret.** It goes in the query string, so error messages are scrubbed of it before they reach a log.
- If CodeHired is ever used commercially (ads, paid plans, selling leads), Adzuna requires a licence agreement first.

JSearch:

- **Never the job sites themselves.** CodeHired only calls `api.openwebninja.com`. It never sends a request to LinkedIn, Indeed, ZipRecruiter or any other site a listing comes from; candidates follow `job_apply_link` themselves.
- **Snippets and partial listings.** Google for Jobs descriptions are plain text and sometimes cut short (`snippetOnly`), so the job page links to the original posting. A run only sees the last day's postings for a few queries, so JSearch jobs are closed for their age, never for missing from a run (`seesOnlyRecentJobs`). When Google states when the offer expires (`job_offer_expiration_datetime_utc`), it is stored as `closes_at`.
- **The key stays secret.** It travels in the `x-api-key` header, never in a URL or a log.
- **Duplicates.** The same opening often comes from a company board too; JSearch ranks below company boards, USAJobs and Adzuna, so the other copy is listed (see Deduplication in the README).

## Not enabled

| Source | Why |
| --- | --- |
| LinkedIn, Indeed, ZipRecruiter (directly) | No public API for this use, and their terms forbid scraping. Their listings reach CodeHired only through JSearch's Google for Jobs results (above), and mostly come from the same company ATS boards anyway |
| [Remotive](https://github.com/remotive-com/remote-jobs-api) | Its terms forbid submitting its jobs to third-party websites and treat using the listings to collect signups or emails as a violation. CodeHired plans user accounts and email alerts for new jobs (see the roadmap), so it does not qualify. Jobs are also delayed by 24 hours, and the feed may be fetched only a few times a day. Remotive sells a private API for other uses |
| [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api) | No terms of use, attribution rules or limits are published, so there is nothing to show that this use is allowed. Its jobs are mostly in Europe and come from ATS boards (Greenhouse among them) that CodeHired can read directly |
| We Work Remotely | Excluded by #30: its API terms prohibit building job search services on its data |
