// Every timestamp in the database uses this format (ISO 8601, UTC, whole seconds), so they sort
// correctly as plain strings: `2026-10-30T14:05:00Z`
export function toIsoSeconds (date: Date = new Date()) {
  return date.toISOString().slice(0, 19) + 'Z'
}
