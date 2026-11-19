// What `pnpm companies:check` does: tries candidate company boards and adds the ones that answer
// with US tech jobs to companies.json. Each board is read with the same code as an ingestion run
// (the adapter's list request and filter), without fetching per-posting details or writing jobs.
import { ATS_PLATFORMS, companiesSchema, type AtsPlatform, type Company } from './companies.js'
import { HttpError, type HttpClient } from './http.js'
import type { BoardInspection } from './sources/board.js'
import { createAshbySource } from './sources/ashby.js'
import { createGreenhouseSource } from './sources/greenhouse.js'
import { createLeverSource } from './sources/lever.js'
import { createSmartRecruitersSource } from './sources/smartrecruiters.js'

export type InspectBoard = (company: Company) => Promise<BoardInspection>

// One inspector per platform, sharing one HTTP client per platform like a run does
export function createBoardInspectors ({ http }: { http?: HttpClient } = {}): Record<AtsPlatform, InspectBoard> {
  const sources = {
    greenhouse: createGreenhouseSource({ companies: [], http }),
    lever: createLeverSource({ companies: [], http }),
    ashby: createAshbySource({ companies: [], http }),
    smartrecruiters: createSmartRecruitersSource({ companies: [], http })
  }
  return {
    greenhouse: (company) => sources.greenhouse.inspectBoard(company),
    lever: (company) => sources.lever.inspectBoard(company),
    ashby: (company) => sources.ashby.inspectBoard(company),
    smartrecruiters: (company) => sources.smartrecruiters.inspectBoard(company)
  }
}

export type CheckStatus =
  // Answers with enough US tech jobs: added with --write
  | 'ok'
  // Answers, but with fewer kept postings than asked (often none in the US right now)
  | 'too-few'
  // The board is already in companies.json, or twice in the candidates
  | 'listed'
  // No such board (404): usually a wrong token
  | 'not-found'
  // Anything else: an outage, a changed API
  | 'failed'

export interface CheckResult {
  company: Company
  status: CheckStatus
  total?: number
  kept?: number
  message?: string
}

const boardKey = (company: Pick<Company, 'ats' | 'token'>) => `${company.ats}/${company.token.toLowerCase()}`

export interface CheckOptions {
  // What companies.json lists already
  existing: readonly Company[]
  inspectors: Record<AtsPlatform, InspectBoard>
  // Kept postings a board needs to be added. Defaults to 1: a board with no US tech job adds nothing.
  minKept?: number
}

// Every candidate is checked at once; each platform's HTTP client keeps only a few in flight
export async function checkCandidates (candidates: readonly Company[], { existing, inspectors, minKept = 1 }: CheckOptions) {
  const seen = new Set(existing.map(boardKey))
  return Promise.all(candidates.map(async (company): Promise<CheckResult> => {
    const key = boardKey(company)
    if (seen.has(key)) return { company, status: 'listed', message: `${key} is already listed` }
    seen.add(key)

    try {
      const { total, kept } = await inspectors[company.ats](company)
      return { company, status: kept >= minKept ? 'ok' : 'too-few', total, kept }
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return { company, status: 'not-found', message: 'no board with this token (404)' }
      }
      return { company, status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
  }))
}

// The list companies.json holds: grouped by platform in ATS_PLATFORMS order, by name within one
export function mergeCompanies (existing: readonly Company[], additions: readonly Company[]) {
  const platformOrder = (company: Company) => ATS_PLATFORMS.indexOf(company.ats)
  const merged = [...existing, ...additions].sort((a, b) =>
    platformOrder(a) - platformOrder(b) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  // Throws on a duplicate, so a bad merge is never written
  return companiesSchema.parse(merged)
}

// One company per line, the way the file is written by hand
export function formatCompaniesJson (companies: readonly Company[]) {
  const lines = companies.map((company) => {
    const fields = (['name', 'ats', 'token', 'website'] as const).map((field) => `"${field}": ${JSON.stringify(company[field])}`)
    return `  { ${fields.join(', ')} }`
  })
  return `[\n${lines.join(',\n')}\n]\n`
}

export function formatCheckLine ({ company, status, total, kept, message }: CheckResult) {
  const board = `${company.ats}/${company.token}`
  if (status === 'ok') return `ok        ${board} (${company.name}): kept ${kept} of ${total} postings`
  // Ashby and SmartRecruiters answer an unknown token with an empty board, not a 404
  if (status === 'too-few' && total === 0) return `too few   ${board} (${company.name}): no postings (a wrong token, or nothing open)`
  if (status === 'too-few') return `too few   ${board} (${company.name}): kept ${kept} of ${total} postings`
  return `${status.padEnd(10)}${board} (${company.name}): ${message}`
}
