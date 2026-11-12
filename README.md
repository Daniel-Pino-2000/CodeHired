# CodeHired

[![CI](https://github.com/Daniel-Pino-2000/CodeHired/actions/workflows/ci.yml/badge.svg)](https://github.com/Daniel-Pino-2000/CodeHired/actions/workflows/ci.yml)

CodeHired is a web platform that helps developers find and apply for programming jobs. It brings job listings, search, and application tracking together in one place, so candidates can go from browsing to applying without bouncing between multiple sites.

## Features

- 🔍 **Job Search** — search and filter programming jobs by keyword, technology, experience level and workplace
- 📄 **Job Listings** — detailed postings with role description, salary, tech stack and company info
- 🔗 **Apply at the Source** — every job names where it was found and links to the original posting to apply. The [`/sources`](apps/web/src/pages/Sources.jsx) page credits every data source and shows when the jobs were last refreshed
- 📊 **Application Tracking** — keep track of jobs you've applied to and their status _(planned)_
- 👤 **User Profiles** — manage your candidate profile and resume _(planned)_
- 📱 **Responsive Design** — works across desktop, tablet and mobile, in light and dark mode

## Tech Stack

| Part | Technologies |
| --- | --- |
| **Frontend** (`apps/web`) | React 19, React Router, Vite, CSS Modules |
| **Backend** (`apps/api`) | Node.js, Express 5, TypeScript, Zod |
| **Database** | SQLite via libSQL (`@libsql/client`): a local file in development, [Turso](https://turso.tech) in production |
| **Tooling** | pnpm workspaces, ESLint, node:test + Supertest, GitHub Actions |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or newer
- [pnpm](https://pnpm.io/) 10 or newer (`npm install -g pnpm`)

### Installation

```bash
git clone https://github.com/Daniel-Pino-2000/CodeHired.git
cd CodeHired
pnpm install
```

Optionally copy the example environment files (the defaults work out of the box):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### Running the project

```bash
pnpm dev
```

This starts both apps:

- Web: <http://localhost:5173>
- API: <http://localhost:3000> (the local database file is created, migrated and filled with fictional sample jobs on first run; with `NODE_ENV=production` it is never seeded)

### Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run API and web in watch mode |
| `pnpm dev:api` / `pnpm dev:web` | Run only one of them |
| `pnpm db:migrate` | Apply pending migrations (`apps/api/src/db/migrations/*.sql`) |
| `pnpm db:seed` | Replace the sample jobs in a **local** database (refuses hosted databases, keeps ingested jobs) |
| `pnpm ingest` | Fetch jobs from every source. `--source=<id>` runs only that source, `--due` skips sources that ran too recently for their terms, `--dry-run` writes nothing |
| `pnpm build` | Production build of both apps |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | API tests (node:test + Supertest, in-memory database) |

### Database

The API talks to SQLite through [libSQL](https://github.com/tursodatabase/libsql), so the same code works with a local file and with a hosted [Turso](https://turso.tech) database (free plan):

| `DATABASE_URL` | Used for |
| --- | --- |
| `file:codehired.db` (default) | Local development |
| `:memory:` | Tests |
| `libsql://<database>-<user>.turso.io` + `DATABASE_AUTH_TOKEN` | Production |

Schema changes are numbered `.sql` files in `apps/api/src/db/migrations/`. They are applied in order, each in its own transaction (so a file must not contain `BEGIN`/`COMMIT` itself), and recorded in the `schema_migrations` table. The API applies pending migrations on start, which is safe when several instances start at once; `pnpm db:migrate` does it on demand.

To try a free Turso database with the [Turso CLI](https://docs.turso.tech/cli/introduction):

```bash
turso db create codehired
turso db show codehired --url
turso db tokens create codehired
```

Put the URL and token in `apps/api/.env` as `DATABASE_URL` and `DATABASE_AUTH_TOKEN`, then run `pnpm db:migrate`.

### Ingestion

Jobs come from external sources through small adapters in `apps/api/src/ingest/sources/`. Each one implements the `Source` interface (`apps/api/src/ingest/types.ts`): it fetches raw postings and maps them to a normalized job. The runner then validates every job with Zod (invalid ones are logged and skipped), inserts new jobs, updates a job only when its content hash changed, touches `last_seen_at` on every job it sees, and records each run in `ingestion_runs`.

On the way, every job is tagged with the technologies its title and description mention, using the dictionary in [`packages/shared/technologies.json`](packages/shared/technologies.json) (the web app reads its labels from the same file). Its level (intern, junior, mid, senior, staff, lead) is inferred from the title.

After each run:

- **Expiry.** A job that the last 3 successful runs of its source did not see is closed. So is a job posted more than 45 days ago, except on company boards, which remove filled roles themselves. Closed jobs disappear from `GET /jobs` and are deleted 60 days later.
- **Deduplication.** The same opening often comes from several sources. Jobs with the same fingerprint (company, title and place, normalized: `Acme, Inc.` = `Acme`, `Sr.` = `Senior`, `NYC` = `New York`) are listed once, from the source with the highest priority: company boards, then USAJobs, Adzuna, JSearch and remote boards. Every place a job appears is recorded in `job_sources`.
- **Free-tier check.** The CLI prints how many jobs are listed, duplicated and closed, and the database size against Turso's free 5 GB.

Adapters fetch through `apps/api/src/ingest/http.ts`, which adds timeouts, retries with exponential backoff, a concurrency limit and a `User-Agent` that identifies CodeHired.

The real sources today are company career boards on **Greenhouse**, **Lever** and **Ashby**: one source per platform, reading every company listed in [`apps/api/src/ingest/companies.json`](apps/api/src/ingest/companies.json). They keep only tech roles in the US or remote from the US. A company whose board fails is logged and skipped; the run goes on. Remote jobs open to US-based applicants also come from three remote job boards whose terms allow it: **Remote OK**, **Himalayas** and **Jobicy**. Every job shows where it was found and links to the original posting, as the sources' terms require. Which sources CodeHired uses, and under what terms, is recorded in [`docs/data-sources.md`](docs/data-sources.md).

```bash
pnpm ingest --source=fixture   # fictional jobs from apps/api/test/fixtures/jobs.json (local databases only)
pnpm ingest --source=lever     # one source
pnpm ingest --dry-run          # fetch and validate everything, write nothing
pnpm ingest --due              # only the sources whose terms allow another run by now
```

### Scheduled ingestion

The [`Ingest jobs`](.github/workflows/ingest.yml) workflow refreshes the production database on GitHub Actions, which is free for public repositories. It runs every 6 hours (`17 */6 * * *`, UTC) with `pnpm ingest --due`: every source whose last run started long enough ago for its terms (`Source.minHoursBetweenRuns`). So one schedule respects every limit in [`docs/data-sources.md`](docs/data-sources.md): the company boards (Greenhouse, Lever, Ashby) run once a day, Remote OK, Himalayas and Jobicy at every run. The table of each run (jobs fetched, inserted, updated, closed per source, and the database size) is on the run's summary page.

To turn it on, add two repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `DATABASE_URL` | `turso db show codehired --url` (`libsql://…`) |
| `DATABASE_AUTH_TOKEN` | `turso db tokens create codehired` |

Without them every run ends early with an "Ingestion skipped" notice, and stays green.

- **Run it by hand:** Actions → Ingest jobs → Run workflow. Leave "Source ids" empty for the sources that are due, or name some (`remoteok,jobicy`) to run them now whatever their last run. Naming the company boards more than once a day breaks our own rule for them, so don't. "Dry run" fetches and validates without writing.
- **Overlaps:** runs never overlap (a `concurrency` group queues them) and each one is stopped after 30 minutes.
- **Failures:** a source that fails fails the run, and GitHub emails the repository owner; the other sources are still ingested.
- **After 60 days without activity** (no commit) in a public repository, GitHub disables scheduled workflows and emails the owner. Turn it back on under Actions → Ingest jobs → **Enable workflow**, or with `gh workflow enable ingest.yml`.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/jobs` | List jobs. Query: `text`, `technology`, `level` (`intern`, `junior`, `mid`, `senior`, `staff`, `lead`), `workplace` (`remote`, `hybrid`, `onsite`), `limit` (max 50), `offset` |
| `GET` | `/jobs/:id` | Get one job, plus `alsoPostedOn`: the other places the same opening was found |
| `GET` | `/sources` | Every data source with its credit and terms links, and when it was last refreshed |

`GET /jobs` responds with `{ data, total, limit, offset }`. Each job has:

- `source`: where it was found, `{ id, name, publisher, url }`. `url` is the original posting, where candidates apply; `publisher` is the site that published it when the source collects jobs from others (JSearch → LinkedIn). `null` for jobs created here (the local demo data)
- `postedAt`: the posting date the source gave, if any. `createdAt` falls back to when CodeHired first saw the job
- `descriptionIsSnippet`: `true` when the source only gives part of the description

`GET /jobs/:id` adds `alsoPostedOn` and `descriptionHtml`: the source's formatted description, or `null` when it only gave plain text (then use `description`).

**Description HTML is sanitized on the server**, with [`sanitize-html`](https://github.com/apostrophecms/sanitize-html) and a strict allowlist ([`utils/sanitize.ts`](apps/api/src/utils/sanitize.ts)): paragraphs, line breaks, lists, headings (moved down to `h3`/`h4`), bold, italic, underline, quotes, code and links. Nothing else survives: no scripts, event handlers, `style`, `class`, images or iframes. Links keep only absolute `http(s)` and `mailto` hrefs, and open in a new tab with `rel="nofollow ugc noopener noreferrer"`. Ingestion stores it sanitized, and `GET /jobs/:id` sanitizes it again on the way out, so a row written any other way is never served raw. The web app inserts it as is. Sanitizing on the server keeps one tested allowlist for every client, and the browser never downloads a sanitizer.

`GET /sources` responds with `{ updatedAt, data }`: `updatedAt` is when the latest successful ingestion run finished, and each source has `{ id, name, url, termsUrl, updatedAt }`.

The fictional seed jobs are only served from a local database: a hosted one never lists them.

## Project Structure

```
CodeHired/
├── apps/
│   ├── api/                  # Express + TypeScript REST API
│   │   ├── src/
│   │   │   ├── app.ts        # Express app (routes + middlewares)
│   │   │   ├── server.ts     # Starts the server
│   │   │   ├── config.ts
│   │   │   ├── controllers/  # HTTP layer: validate input, shape responses
│   │   │   ├── models/       # Data access (SQL)
│   │   │   ├── routes/
│   │   │   ├── schemas/      # Zod validation schemas
│   │   │   ├── middlewares/
│   │   │   └── db/           # libSQL client, migrations, seed data
│   │   └── test/             # API tests (node:test + Supertest)
│   └── web/                  # React + Vite frontend
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── hooks/
│           ├── services/     # API client
│           └── utils/
├── packages/
│   └── shared/               # Data both apps use: the technology dictionary
├── package.json              # Workspace scripts
└── pnpm-workspace.yaml
```

The first versions of the site (plain HTML/CSS and vanilla JavaScript) are preserved in the git tags [`v0-html-css`](https://github.com/Daniel-Pino-2000/CodeHired/tree/v0-html-css) and [`v1-vanilla-js`](https://github.com/Daniel-Pino-2000/CodeHired/tree/v1-vanilla-js).

## Roadmap

The roadmap lives in [GitHub Issues](https://github.com/Daniel-Pino-2000/CodeHired/issues), ordered by milestone. Highlights:

- [ ] Brand identity and UI polish
- [ ] Create / edit / delete jobs (employer job posting)
- [ ] User authentication (sign up / login)
- [ ] Saved jobs / favorites
- [ ] Application tracking
- [ ] Advanced filtering (salary, employment type)
- [ ] AI job summaries
- [ ] Tests, CI/CD, Docker and deployment
- [ ] Email notifications for new matching jobs

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/Daniel-Pino-2000/CodeHired/issues) if you'd like to contribute, and read [CONTRIBUTING.md](CONTRIBUTING.md) first (it explains, among other things, how to add a company to the job sources).

## Acknowledgements

The project architecture follows the job board built in [midudev's JSCamp](https://github.com/midudev/jscamp) bootcamp. The code, design and data in this repository are my own.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Author

**Daniel Pino**
- GitHub: [@Daniel-Pino-2000](https://github.com/Daniel-Pino-2000)
