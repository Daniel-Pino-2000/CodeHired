import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import {
  checkCandidates,
  createBoardInspectors,
  formatCheckLine,
  formatCompaniesJson,
  mergeCompanies,
  type InspectBoard
} from '../src/ingest/board-check.js'
import { ATS_PLATFORMS, COMPANIES, type AtsPlatform, type Company } from '../src/ingest/companies.js'
import { createHttpClient, HttpError } from '../src/ingest/http.js'

const company = (ats: Company['ats'], token: string, name = token): Company =>
  ({ name, ats, token, website: `https://${token.toLowerCase()}.example.com` })

// Every platform answers with the same inspector
const inspectorsFrom = (inspect: InspectBoard) =>
  Object.fromEntries(ATS_PLATFORMS.map((ats) => [ats, inspect])) as Record<AtsPlatform, InspectBoard>

describe('pnpm companies:check', () => {
  test('passes boards with US tech jobs, and says why the others did not', async () => {
    const boards: Record<string, () => Promise<{ total: number, kept: number }>> = {
      'greenhouse/acme': async () => ({ total: 40, kept: 12 }),
      'lever/quiet': async () => ({ total: 9, kept: 0 }),
      'ashby/typo': async () => { throw new HttpError(404, 'https://api.ashbyhq.com/posting-api/job-board/typo') },
      'smartrecruiters/Down': async () => { throw new Error('GET https://api.smartrecruiters.com/... failed after 4 attempts') }
    }
    const existing = [company('greenhouse', 'discord', 'Discord')]
    const candidates = [
      company('greenhouse', 'acme', 'Acme'),
      company('lever', 'quiet', 'Quiet Co'),
      company('ashby', 'typo', 'Typo Inc'),
      company('smartrecruiters', 'Down', 'Down Corp'),
      company('greenhouse', 'Discord', 'Discord again'),
      company('greenhouse', 'ACME', 'Acme twice')
    ]

    const results = await checkCandidates(candidates, {
      existing,
      inspectors: inspectorsFrom((entry) => boards[`${entry.ats}/${entry.token}`]())
    })

    assert.deepEqual(results.map((result) => result.status), ['ok', 'too-few', 'not-found', 'failed', 'listed', 'listed'])
    assert.deepEqual(results.map(formatCheckLine), [
      'ok        greenhouse/acme (Acme): kept 12 of 40 postings',
      'too few   lever/quiet (Quiet Co): kept 0 of 9 postings',
      'not-found ashby/typo (Typo Inc): no board with this token (404)',
      'failed    smartrecruiters/Down (Down Corp): GET https://api.smartrecruiters.com/... failed after 4 attempts',
      'listed    greenhouse/Discord (Discord again): greenhouse/discord is already listed',
      'listed    greenhouse/ACME (Acme twice): greenhouse/acme is already listed'
    ])
  })

  test('--min-kept raises the bar', async () => {
    const results = await checkCandidates([company('greenhouse', 'small')], {
      existing: [],
      inspectors: inspectorsFrom(async () => ({ total: 5, kept: 2 })),
      minKept: 3
    })
    assert.equal(results[0].status, 'too-few')
  })

  test('inspects with the same list request and filter as an ingestion run', async () => {
    const urls: string[] = []
    const fetch = async (url: string | URL | Request) => {
      urls.push(String(url))
      const jobs = [
        { id: 1, title: 'Software Engineer', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/1', location: { name: 'Austin, TX' } },
        { id: 2, title: 'Account Executive', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/2', location: { name: 'Austin, TX' } }
      ]
      return new Response(JSON.stringify({ jobs }), { headers: { 'Content-Type': 'application/json' } })
    }
    const inspectors = createBoardInspectors({ http: createHttpClient({ fetch: fetch as typeof globalThis.fetch, retries: 0 }) })

    assert.deepEqual(await inspectors.greenhouse(company('greenhouse', 'acme')), { total: 2, kept: 1 })
    assert.deepEqual(urls, ['https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true&pay_transparency=true'])
  })

  test('adds boards grouped by platform and sorted by name, in the hand-written format', async () => {
    const merged = mergeCompanies(COMPANIES, [company('smartrecruiters', 'Zeta', 'Zeta'), company('greenhouse', 'aaa', 'AAA Labs')])

    assert.equal(merged.length, COMPANIES.length + 2)
    assert.equal(merged[0].name, 'AAA Labs')
    assert.equal(merged.at(-1)!.name, 'Zeta')
    const platforms = merged.map((entry) => ATS_PLATFORMS.indexOf(entry.ats))
    assert.deepEqual(platforms, [...platforms].sort((a, b) => a - b))

    // Writing the list as it is reproduces the file byte for byte
    const file = await readFile(new URL('../src/ingest/companies.json', import.meta.url), 'utf8')
    assert.equal(formatCompaniesJson(mergeCompanies(COMPANIES, [])), file.replace(/\r\n/g, '\n'))
  })

  test('never merges a board that is already listed', () => {
    assert.throws(() => mergeCompanies(COMPANIES, [{ ...COMPANIES[0], name: 'Copy' }]), /listed more than once/)
  })
})
