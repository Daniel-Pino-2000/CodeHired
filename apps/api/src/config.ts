const DATABASE_URL = process.env.DATABASE_URL ?? 'file:codehired.db'

export const CONFIG = {
  PORT: Number(process.env.PORT ?? 3000),
  // `file:codehired.db` locally, `:memory:` in tests, `libsql://<db>.turso.io` in production
  DATABASE_URL,
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || undefined,
  // Local databases can be seeded with demo data; a hosted one never is
  IS_LOCAL_DATABASE: DATABASE_URL === ':memory:' || DATABASE_URL.startsWith('file:'),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50
} as const
