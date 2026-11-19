# Contributing to CodeHired

Thanks for helping. Issues and pull requests are welcome; the [issues page](https://github.com/Daniel-Pino-2000/CodeHired/issues) holds the roadmap.

## Workflow

1. Pick an issue, or open one first for anything bigger than a typo.
2. Create one branch per issue (`feat/26-ats-sources`, `fix/...`, `docs/...`) and open one pull request per issue. Write `Closes #<issue>` in its description.
3. Before pushing, run the same checks as CI from the repository root:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

4. Tests never hit the network: `apps/api/test/setup.ts` replaces `fetch` with a stub that fails. Code that fetches takes an injectable HTTP client, and tests use recorded JSON fixtures from `apps/api/test/fixtures/`.

All code must be original. Job data comes only from official or public APIs whose terms allow it; never scrape job sites. See [docs/data-sources.md](docs/data-sources.md).

## How to add a company

CodeHired reads the public career boards of the companies listed in [`apps/api/src/ingest/companies.json`](apps/api/src/ingest/companies.json). Each entry is:

```json
{ "name": "Acme", "ats": "greenhouse", "token": "acme", "website": "https://www.acme.com" }
```

| Field | What it is |
| --- | --- |
| `name` | The company name shown on its jobs |
| `ats` | `greenhouse`, `lever`, `ashby` or `smartrecruiters` |
| `token` | The board's name in its URL (see below) |
| `website` | The company's homepage, `https://` |

1. **Find the platform and the token.** Open the company's careers page and follow a job link:

   | The job link looks like | `ats` | `token` |
   | --- | --- | --- |
   | `boards.greenhouse.io/acme/jobs/123` or `job-boards.greenhouse.io/acme/...` | `greenhouse` | `acme` |
   | `jobs.lever.co/acme/...` | `lever` | `acme` |
   | `jobs.ashbyhq.com/acme/...` | `ashby` | `acme` |
   | `jobs.smartrecruiters.com/Acme/...` | `smartrecruiters` | `Acme` (keep the capitals) |

   Companies on other platforms (Workday, iCIMS, a custom site...) cannot be added yet (#36).

2. **Check that the board answers** with a `200` and a list of jobs:

   ```bash
   curl -s "https://boards-api.greenhouse.io/v1/boards/acme/jobs" | head -c 300
   curl -s "https://api.lever.co/v0/postings/acme?mode=json" | head -c 300
   curl -s "https://api.ashbyhq.com/posting-api/job-board/acme" | head -c 300
   curl -s "https://api.smartrecruiters.com/v1/companies/Acme/postings?country=us" | head -c 300
   ```

   A `404` means the token is wrong (Ashby and SmartRecruiters answer a wrong token with an empty list instead). An empty list is fine for now, but prefer companies that hire in the US.

3. **Add the entry** to `companies.json`, in alphabetical order within its platform. Use the company's usual name, not the token.

4. **Try it** without writing anything:

   ```bash
   pnpm ingest --source=greenhouse --dry-run
   ```

   The log has one line per company, such as `[greenhouse] Acme: kept 12 of 40 postings` (only US and US-remote tech roles are kept). A board that fails shows up as `skipped Acme (acme): ...` and does not stop the run.

5. **Run the tests**: `pnpm test` checks that every entry is valid and that no board is listed twice.

### Adding many companies at once

`pnpm companies:check` does steps 2 to 4 for a whole list. Write the candidates to a JSON file shaped like `companies.json` (outside the repository, or delete it afterwards), then:

```bash
pnpm companies:check ~/candidates.json          # report only
pnpm companies:check ~/candidates.json --write  # add the boards that pass
```

Each board is read with the same request and filter as an ingestion run (no per-posting requests, nothing written to the database). The report has one line per candidate: `ok` (kept at least one US tech posting; `--min-kept=<n>` raises the bar), `too few`, `not-found` (a `404`), `failed` or `listed` (already in `companies.json`). With `--write`, the `ok` ones are added in alphabetical order within their platform. Check the names and websites by hand, and look at what a big board keeps before adding it: at hardware or industrial employers the title filter still lets through some non-software "Engineer" roles. Then run `pnpm test`.

If a company's board later disappears or moves, the run logs it as skipped every time; fix the token or remove the entry. If a company asks not to be listed, remove it.
