// Helpers shared by the source adapters to map raw postings onto the `jobs` columns. The level,
// workplace and technology rules are deliberately simple; #31 refines them.
import { createHash } from 'node:crypto'
import type { EmploymentType, Level, Workplace } from '../types.js'
import type { NormalizedJob } from './schema.js'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“'
}

export function decodeEntities (text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity
  })
}

// Plain text with paragraphs separated by a blank line, which is how the web app renders
// `description` today. The HTML itself is kept in `description_html` for #9.
export function htmlToText (html: string) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|section|article|blockquote|table|tr)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')

  // Entities are decoded after the tags are gone, so an escaped `&lt;b&gt;` stays as text
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function inferLevel (title: string): Level {
  if (/\bintern(ship)?\b/i.test(title)) return 'junior'
  if (/\b(lead|principal|staff|head|director|manager|architect|vp)\b/i.test(title)) return 'lead'
  if (/\b(senior|sr)\b/i.test(title)) return 'senior'
  if (/\b(junior|jr|entry[- ]level|graduate|new grad|associate)\b/i.test(title)) return 'junior'
  return 'mid'
}

// `text` is whatever the source says about the contract: "Full-time", "Contract", a title...
export function inferEmploymentType (text: string): EmploymentType {
  if (/\bintern(ship)?\b/i.test(text)) return 'internship'
  if (/\bpart[- ]?time\b/i.test(text)) return 'part-time'
  if (/\b(contract(or)?|freelance|temporary)\b/i.test(text)) return 'contract'
  return 'full-time'
}

export function inferWorkplace ({ remote, text = '' }: { remote: boolean, text?: string }): Workplace {
  if (remote) return 'remote'
  return /\bhybrid\b/i.test(text) ? 'hybrid' : 'onsite'
}

interface Place {
  city?: string | null
  state?: string | null
  country?: string | null
  remote: boolean
}

// "Austin, TX", "Remote (US)", "Remote". Empty when the source gives nothing to go on,
// which fails validation: a job without a location cannot be filtered.
export function formatLocation ({ city, state, country, remote }: Place) {
  const place = [city, state].filter(Boolean).join(', ') || country || ''
  if (remote) return place ? `Remote (${place})` : 'Remote'
  return place
}

// Same slugs as the seed data: lowercase, dashes instead of spaces, no duplicates
export function normalizeTechnologies (tags: readonly string[]) {
  const slugs = tags.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
  return [...new Set(slugs)].slice(0, 15)
}

// Salaries come as strings, floats or zero for "not published"
export function toWholeNumber (value: unknown) {
  const number = typeof value === 'string' ? Number(value.replace(/[,$\s]/g, '')) : value
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

// Changes whenever any stored field of the job changes. The schema always outputs keys in the
// same order, so equal jobs serialize to the same string.
export function contentHash (job: NormalizedJob) {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex')
}
