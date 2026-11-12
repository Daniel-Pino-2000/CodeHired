import type { Source } from '../types.js'
import { createAshbySource } from './ashby.js'
import { createFixtureSource } from './fixture.js'
import { createGreenhouseSource } from './greenhouse.js'
import { createHimalayasSource } from './himalayas.js'
import { createJobicySource } from './jobicy.js'
import { createLeverSource } from './lever.js'
import { createRemoteOkSource } from './remoteok.js'

// Every source `pnpm ingest` knows about. New adapters are added here.
export const SOURCES: readonly Source[] = [
  createFixtureSource(),
  createGreenhouseSource(),
  createLeverSource(),
  createAshbySource(),
  createRemoteOkSource(),
  createHimalayasSource(),
  createJobicySource()
]

// How a source must be credited where its jobs are shown; undefined for jobs created here (the seed)
export function getAttribution (sourceId: string) {
  return SOURCES.find((source) => source.id === sourceId)?.attribution
}

// The sources named on the command line, or every real source when none is named
export function resolveSources (ids: readonly string[], { isLocalDatabase }: { isLocalDatabase: boolean }) {
  if (ids.length === 0) {
    return SOURCES.filter((source) => !source.devOnly)
  }

  return ids.map((id) => {
    const source = SOURCES.find((candidate) => candidate.id === id)
    if (!source) {
      throw new Error(`Unknown source "${id}". Available: ${SOURCES.map((s) => s.id).join(', ')}`)
    }
    if (source.devOnly && !isLocalDatabase) {
      throw new Error(`Source "${id}" has fictional data and only runs against a local database`)
    }
    return source
  })
}
