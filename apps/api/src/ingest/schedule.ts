import type { Source } from './types.js'

const HOUR_MS = 60 * 60 * 1000

export interface NotDue {
  source: Source
  // When `--due` will run it again (ISO 8601)
  dueAt: string
}

// Which sources a scheduled run (`pnpm ingest --due`) fetches: those that never ran, or whose last
// run started at least `minHoursBetweenRuns` ago. This is how one schedule respects every source's
// limits: the company boards run once a day, Jobicy at most hourly, the others every time.
export function splitDueSources (
  sources: readonly Source[],
  lastStarted: ReadonlyMap<string, string>,
  now: Date = new Date()
): { due: Source[], notDue: NotDue[] } {
  const due: Source[] = []
  const notDue: NotDue[] = []
  for (const source of sources) {
    const last = lastStarted.get(source.id)
    if (!source.minHoursBetweenRuns || !last) {
      due.push(source)
      continue
    }
    const dueAt = new Date(Date.parse(last) + source.minHoursBetweenRuns * HOUR_MS)
    if (dueAt.getTime() <= now.getTime()) {
      due.push(source)
    } else {
      notDue.push({ source, dueAt: dueAt.toISOString().slice(0, 19) + 'Z' })
    }
  }
  return { due, notDue }
}
