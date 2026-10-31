// The same opening is often listed by several sources: the company's own board, Adzuna, LinkedIn
// through JSearch... Jobs that share a fingerprint are one opening; the one from the source with
// the highest priority is listed, and the others are recorded as `duplicate_of` it.
import type { NormalizedJob } from './schema.js'

// Lower wins. The company's own board has the most accurate data and the direct apply link.
export const SOURCE_PRIORITY = {
  companyAts: 0,
  usaJobs: 1,
  adzuna: 2,
  jsearch: 3,
  remoteBoard: 4,
  // Sources that do not declare a priority
  unknown: 5,
  // Fictional jobs
  sample: 9
} as const

// Legal suffixes that one source writes and another leaves out: "Acme, Inc." and "Acme"
const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh)\b/g

// Abbreviations boards use for the same title: "Sr. Software Eng." and "Senior Software Engineer"
const TITLE_WORDS: Array<[RegExp, string]> = [
  [/\bsr\b/g, 'senior'],
  [/\bjr\b/g, 'junior'],
  [/\beng\b/g, 'engineer'],
  [/\bdev\b/g, 'developer'],
  [/\bmgr\b/g, 'manager'],
  [/\bswe\b/g, 'software engineer'],
  [/\bii\b/g, '2'],
  [/\biii\b/g, '3'],
  [/\biv\b/g, '4'],
  // Where the job is done belongs to the place, not the title: "Backend Engineer (Remote)"
  [/\b(remote|hybrid|on ?site|in office|us|usa)\b/g, '']
]

// Spellings of the same city
const CITY_ALIASES: Record<string, string> = {
  nyc: 'new york',
  'new york city': 'new york',
  sf: 'san francisco',
  'san francisco bay area': 'san francisco',
  'bay area': 'san francisco',
  'washington dc': 'washington',
  'washington d c': 'washington'
}

// Lower case, no accents, no punctuation, single spaces
function simplify (text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

export function fingerprintCompany (company: string) {
  return collapse(simplify(company).replace(COMPANY_SUFFIXES, ''))
}

export function fingerprintTitle (title: string) {
  let text = simplify(title)
  for (const [pattern, replacement] of TITLE_WORDS) text = text.replace(pattern, replacement)
  return collapse(text)
}

function fingerprintPlace ({ city, state, remote, location }: Pick<NormalizedJob, 'city' | 'state' | 'remote' | 'location'>) {
  if (!city && !state) return remote ? 'remote' : simplify(location)
  const simpleCity = city ? simplify(city) : ''
  return [CITY_ALIASES[simpleCity] ?? simpleCity, state ? simplify(state) : ''].join(' ').trim()
}

// "acme|senior backend engineer|austin tx"
export function fingerprint (job: Pick<NormalizedJob, 'company' | 'title' | 'city' | 'state' | 'remote' | 'location'>) {
  return [fingerprintCompany(job.company), fingerprintTitle(job.title), fingerprintPlace(job)].join('|')
}
