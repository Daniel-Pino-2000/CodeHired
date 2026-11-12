import type { Request, Response } from 'express'
import { SOURCES } from '../ingest/sources/index.js'
import { IngestionRunModel } from '../models/ingestion-run.js'
import type { SourceSummary } from '../types.js'

export class SourceController {
  // Every real data source, with the credit and terms links the /sources page shows, and when the
  // data was last refreshed (`updatedAt`: the latest successful run of any source)
  static async getAll (_req: Request, res: Response) {
    const lastSucceeded = await IngestionRunModel.lastSucceeded()

    const data: SourceSummary[] = SOURCES
      .filter((source) => !source.devOnly)
      .map((source) => ({
        id: source.id,
        name: source.attribution.label,
        url: source.attribution.url,
        termsUrl: source.attribution.termsUrl ?? null,
        updatedAt: lastSucceeded.get(source.id) ?? null
      }))

    const updatedAt = data
      .map((source) => source.updatedAt)
      .filter((date) => date !== null)
      .toSorted()
      .at(-1) ?? null

    return res.json({ updatedAt, data })
  }
}
