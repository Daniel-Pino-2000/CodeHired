const DATABASE_URL = process.env.DATABASE_URL ?? 'file:codehired.db'
const NODE_ENV = process.env.NODE_ENV ?? 'development'

export const CONFIG = {
  NODE_ENV,
  // Unset means development; Vercel sets NODE_ENV=production
  IS_DEVELOPMENT: NODE_ENV === 'development',
  PORT: Number(process.env.PORT ?? 3000),
  // `file:codehired.db` locally, `:memory:` in tests, `libsql://<db>.turso.io` in production
  DATABASE_URL,
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || undefined,
  // Only local databases can be seeded with the fictional demo jobs; a hosted one never is
  IS_LOCAL_DATABASE: DATABASE_URL === ':memory:' || DATABASE_URL.startsWith('file:'),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50
} as const
