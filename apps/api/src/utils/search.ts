// Turns what a person types in the search box into an FTS5 query (`jobs_fts MATCH ...`).
// FTS5 has its own query language (AND, OR, NOT, NEAR, column filters, quotes), so user text is
// never passed through: each word becomes a quoted phrase, and every phrase must match.

const MAX_TERMS = 10

// Shorter words match whole words only: "go" should not find "Google" and "good", nor "ai" "said"
const MIN_PREFIX_LENGTH = 3

// What can be part of a word: letters and digits in any script, and the characters of names like
// "C++", "C#", "Node.js", "full-stack" (the tokenizer splits on `.` and `-`, and a quoted phrase
// keeps those parts together)
const WORD = /[\p{L}\p{N}+#.\-_']+/gu
// What the tokenizer keeps of a word
const KEPT = /[\p{L}\p{N}+#]/gu

// `front dev go` → `"front"* "dev" "go"`: words of 3+ characters also match longer words
// ("front" finds "Frontend"), like the old substring search did. A word typed with a trailing `*`
// is always a prefix. Null when nothing is searchable.
export function toFtsQuery (text: string): string | null {
  const terms: string[] = []

  for (const word of text.split(/\s+/)) {
    // The tokenizer splits "women's" into "women" and "s"; the phrase does the same
    const cleaned = (word.match(WORD) ?? []).join(' ').replaceAll("'", ' ').trim()
    const kept = cleaned.match(KEPT)?.length ?? 0
    if (kept === 0) continue
    const prefix = word.endsWith('*') || kept >= MIN_PREFIX_LENGTH
    terms.push(`"${cleaned}"${prefix ? '*' : ''}`)
  }

  return terms.length > 0 ? terms.slice(0, MAX_TERMS).join(' ') : null
}
