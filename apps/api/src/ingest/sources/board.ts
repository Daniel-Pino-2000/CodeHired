// What the Greenhouse, Lever and Ashby adapters share: one source per ATS that reads the board of
// every company on it in companies.json. A board that fails (renamed token, outage, bad JSON) is
// logged and skipped, so one company never fails the whole run.
import type { Company } from '../companies.js'
import { createHttpClient, type HttpClient } from '../http.js'
import type { NormalizedJobInput } from '../schema.js'
import type { Attribution, Source } from '../types.js'

// A posting together with the company whose board listed it
export interface BoardPosting<Posting> {
  company: Company
  posting: Posting
}

export interface BoardSourceOptions {
  // Defaults to every company on this ATS in companies.json
  companies?: readonly Company[]
  // Injected by tests, which must never hit the network
  http?: HttpClient
}

interface BoardSourceDefinition<Posting> {
  id: string
  name: string
  attribution: Attribution
  priority: number
  companies: readonly Company[]
  http?: HttpClient
  // Every posting on one company's board
  fetchBoard (http: HttpClient, company: Company): Promise<Posting[]>
  // Whether CodeHired lists it: a tech role in the US or remote from the US
  keep (posting: Posting): boolean
  normalize (raw: BoardPosting<Posting>): NormalizedJobInput
}

export function createBoardSource<Posting> ({
  id,
  name,
  attribution,
  priority,
  companies,
  http = createHttpClient(),
  fetchBoard,
  keep,
  normalize
}: BoardSourceDefinition<Posting>): Source<BoardPosting<Posting>> {
  return {
    id,
    name,
    attribution,
    priority,
    listsOnlyOpenJobs: true,
    async * fetchJobs ({ logger }) {
      // Every board is requested up front and the HTTP client keeps only a few in flight. Only the
      // kept postings stay in memory while earlier boards are being written.
      const boards = companies.map((company) => fetchBoard(http, company)
        .then((postings) => ({ company, total: postings.length, kept: postings.filter(keep) }))
        .catch((error: unknown) => ({ company, error })))

      for (const pending of boards) {
        const board = await pending
        const { company } = board
        if ('error' in board) {
          const message = board.error instanceof Error ? board.error.message : String(board.error)
          logger.warn(`[${id}] skipped ${company.name} (${company.token}): ${message}`)
          continue
        }
        logger.info(`[${id}] ${company.name}: kept ${board.kept.length} of ${board.total} postings`)
        for (const posting of board.kept) {
          yield { company, posting }
        }
      }
    },
    normalize
  }
}

// The token is part of the URL path
export const boardPath = (company: Company) => encodeURIComponent(company.token)

// Boards answer an object or an array; anything else means the API changed under us
export function expectArray<T> (value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`unexpected response: ${what} is not a list`)
  return value as T[]
}
