// Budget guard for sources with a request quota (Adzuna, JSearch). Every call is counted in
// `api_usage` before it is made, per UTC day, ISO week and month, so the count survives between
// runs (GitHub Actions starts from scratch every time) and a run stops before a limit is reached.
// Scheduled runs never overlap (the workflow's `concurrency` group), so checking and counting in
// two statements is safe.
import { db } from '../db/database.js'

export type BudgetPeriod = 'day' | 'week' | 'month'

// Calls allowed per period; an unset period has no limit of ours
export type BudgetLimits = Partial<Record<BudgetPeriod, number>>

export interface CallBudget {
  // Counts one call and returns true, or returns false (counting nothing) when any limit is reached
  take (): Promise<boolean>
  // Calls left in the tightest period
  remaining (): Promise<number>
}

// `2026-11-19`, `2026-W47`, `2026-11`, all in UTC
export function periodKey (period: BudgetPeriod, date: Date) {
  const iso = date.toISOString()
  if (period === 'day') return iso.slice(0, 10)
  if (period === 'month') return iso.slice(0, 7)

  // ISO 8601 week: weeks start on Monday, and week 1 holds the year's first Thursday
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function createCallBudget (source: string, limits: BudgetLimits, { now = () => new Date() }: { now?: () => Date } = {}): CallBudget {
  const periods = (Object.entries(limits) as Array<[BudgetPeriod, number]>)
    .filter(([, max]) => Number.isFinite(max))

  async function usage () {
    const date = now()
    const keys = periods.map(([period, max]) => ({ key: periodKey(period, date), max }))
    if (keys.length === 0) return []
    const { rows } = await db.execute({
      sql: `SELECT period, calls FROM api_usage WHERE source = ? AND period IN (${keys.map(() => '?').join(', ')})`,
      args: [source, ...keys.map(({ key }) => key)]
    })
    const calls = new Map(rows.map((row) => [String(row.period), Number(row.calls)]))
    return keys.map(({ key, max }) => ({ key, max, calls: calls.get(key) ?? 0 }))
  }

  return {
    async take () {
      const current = await usage()
      if (current.some(({ calls, max }) => calls >= max)) return false
      if (current.length === 0) return true
      await db.batch(current.map(({ key }) => ({
        sql: `
          INSERT INTO api_usage (source, period, calls) VALUES (?, ?, 1)
          ON CONFLICT (source, period) DO UPDATE SET calls = calls + 1
        `,
        args: [source, key]
      })), 'write')
      return true
    },
    async remaining () {
      const current = await usage()
      if (current.length === 0) return Infinity
      return Math.max(0, Math.min(...current.map(({ calls, max }) => max - calls)))
    }
  }
}
