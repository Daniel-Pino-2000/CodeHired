import type { Row } from '@libsql/client'
import { db } from '../db/database.js'

export type RunStatus = 'running' | 'succeeded' | 'failed'

export interface RunCounts {
  fetched: number
  inserted: number
  updated: number
  failed: number
  // Jobs of this source closed after the run: not seen lately, or too old
  closed: number
}

export interface IngestionRun extends RunCounts {
  id: number
  source: string
  status: RunStatus
  startedAt: string
  finishedAt: string | null
  error: string | null
}

function toRun (row: Row): IngestionRun {
  return {
    id: Number(row.id),
    source: String(row.source),
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at as string | null,
    fetched: Number(row.fetched),
    inserted: Number(row.inserted),
    updated: Number(row.updated),
    failed: Number(row.failed),
    closed: Number(row.closed),
    error: row.error as string | null
  }
}

export class IngestionRunModel {
  // Recorded before fetching anything, so a run that crashes still leaves a 'running' row behind
  static async start (source: string, startedAt: string): Promise<number> {
    const { rows } = await db.execute({
      sql: 'INSERT INTO ingestion_runs (source, started_at) VALUES (?, ?) RETURNING id',
      args: [source, startedAt]
    })
    return Number(rows[0].id)
  }

  static async finish (id: number, result: RunCounts & { status: RunStatus, finishedAt: string, error: string | null }) {
    await db.execute({
      sql: `
        UPDATE ingestion_runs
        SET status = @status, finished_at = @finishedAt, fetched = @fetched, inserted = @inserted,
            updated = @updated, failed = @failed, closed = @closed, error = @error
        WHERE id = @id
      `,
      args: { id, ...result }
    })
  }

  // Newest first
  static async getAll (source?: string): Promise<IngestionRun[]> {
    const { rows } = source
      ? await db.execute({ sql: 'SELECT * FROM ingestion_runs WHERE source = ? ORDER BY id DESC', args: [source] })
      : await db.execute('SELECT * FROM ingestion_runs ORDER BY id DESC')
    return rows.map(toRun)
  }
}
