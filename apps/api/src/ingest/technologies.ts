// Tags jobs with the technologies their title and description mention, using the dictionary the
// web app also reads its labels from (packages/shared/technologies.json).
import dictionary from '@codehired/shared/technologies.json' with { type: 'json' }

interface DictionaryEntry {
  label: string
  // Regex sources; each one must match a whole term, see `TERM_START` and `TERM_END`
  match: string[]
  // For names that are also common words: "Go", "Rust", "Swift", "Spark"
  caseSensitive?: boolean
}

const ENTRIES = Object.entries(dictionary as Record<string, DictionaryEntry>)

export const TECHNOLOGY_SLUGS: ReadonlySet<string> = new Set(ENTRIES.map(([slug]) => slug))

// Word boundaries that also treat ".", "+" and "#" as part of a name: "Node.js", "C++", "C#",
// ".NET". `\b` would find "SQL" in "PostgreSQL" and "C" in "C++".
const TERM_START = '(?<![\\w.+#])'
const TERM_END = '(?![\\w+#])'

const PATTERNS = ENTRIES.map(([slug, { match, caseSensitive = false }]) => ({
  slug,
  regex: new RegExp(`${TERM_START}(?:${match.join('|')})${TERM_END}`, caseSensitive ? 'g' : 'gi')
}))

// Every technology the text mentions, the earliest mention first
export function tagTechnologies (text: string): string[] {
  const found: Array<{ slug: string, index: number }> = []
  for (const { slug, regex } of PATTERNS) {
    regex.lastIndex = 0
    const match = regex.exec(text)
    if (match) found.push({ slug, index: match.index })
  }
  return found.sort((a, b) => a.index - b.index).map(({ slug }) => slug)
}
