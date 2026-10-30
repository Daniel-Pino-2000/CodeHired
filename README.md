# CodeHired

[![CI](https://github.com/Daniel-Pino-2000/CodeHired/actions/workflows/ci.yml/badge.svg)](https://github.com/Daniel-Pino-2000/CodeHired/actions/workflows/ci.yml)

CodeHired is a web platform that helps developers find and apply for programming jobs. It brings job listings, search, and application tracking together in one place, so candidates can go from browsing to applying without bouncing between multiple sites.

## Features

- 🔍 **Job Search** — search and filter programming jobs by keyword, technology, experience level and workplace
- 📄 **Job Listings** — detailed postings with role description, salary, tech stack and company info
- ✅ **Apply Directly** — apply to jobs directly through the platform _(in progress)_
- 📊 **Application Tracking** — keep track of jobs you've applied to and their status _(planned)_
- 👤 **User Profiles** — manage your candidate profile and resume _(planned)_
- 📱 **Responsive Design** — works across desktop, tablet and mobile, in light and dark mode

## Tech Stack

| Part | Technologies |
| --- | --- |
| **Frontend** (`apps/web`) | React 19, React Router, Vite, CSS Modules |
| **Backend** (`apps/api`) | Node.js, Express 5, TypeScript, Zod |
| **Database** | SQLite (better-sqlite3) |
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
- API: <http://localhost:3000> (the SQLite database is created and seeded on first run)

### Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run API and web in watch mode |
| `pnpm dev:api` / `pnpm dev:web` | Run only one of them |
| `pnpm db:seed` | Reset the database with the sample jobs |
| `pnpm build` | Production build of both apps |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | API tests (node:test + Supertest, in-memory database) |

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/jobs` | List jobs. Query: `text`, `technology`, `level` (`junior`, `mid`, `senior`, `lead`), `workplace` (`remote`, `hybrid`, `onsite`), `limit` (max 50), `offset` |
| `GET` | `/jobs/:id` | Get one job |

`GET /jobs` responds with `{ data, total, limit, offset }`.

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
│   │   │   └── db/           # Connection, schema, seed data
│   │   └── test/             # API tests (node:test + Supertest)
│   └── web/                  # React + Vite frontend
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── hooks/
│           ├── services/     # API client
│           └── utils/
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

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/Daniel-Pino-2000/CodeHired/issues) if you'd like to contribute.

## Acknowledgements

The project architecture follows the job board built in [midudev's JSCamp](https://github.com/midudev/jscamp) bootcamp. The code, design and data in this repository are my own.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Author

**Daniel Pino**
- GitHub: [@Daniel-Pino-2000](https://github.com/Daniel-Pino-2000)
