const DATABASE_URL = process.env.DATABASE_URL ?? 'file:codehired.db'
const NODE_ENV = process.env.NODE_ENV ?? 'development'
const IS_DEVELOPMENT = NODE_ENV === 'development'

// Signs the session cookies. Development and tests fall back to a fixed secret so the API runs
// without setup; anywhere else it must be set, or the auth routes answer 500.
const JWT_SECRET = process.env.JWT_SECRET || (IS_DEVELOPMENT ? 'codehired-development-secret-not-for-production' : undefined)

export const CONFIG = {
  NODE_ENV,
  // Unset means development; Vercel sets NODE_ENV=production
  IS_DEVELOPMENT,
  PORT: Number(process.env.PORT ?? 3000),
  // `file:codehired.db` locally, `:memory:` in tests, `libsql://<db>.turso.io` in production
  DATABASE_URL,
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || undefined,
  // Only local databases can be seeded with the fictional demo jobs; a hosted one never is, and
  // the API never lists seed jobs from one
  IS_LOCAL_DATABASE: DATABASE_URL === ':memory:' || DATABASE_URL.startsWith('file:'),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Proxy hops in front of the API whose X-Forwarded-For is trusted, so rate limits count the
  // client's IP: one on Vercel, none locally (the Vite proxy does not send the header)
  TRUST_PROXY: Number(process.env.TRUST_PROXY || (IS_DEVELOPMENT ? 0 : 1)),
  JWT_SECRET,
  SESSION_COOKIE: 'codehired_session',
  SESSION_DAYS: 7,
  // Login attempts per IP and window; registrations get the same budget
  AUTH_RATE_LIMIT: { limit: 10, windowMs: 15 * 60 * 1000 },
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  DEFAULT_COMPANIES_PAGE_SIZE: 24,
  MAX_COMPANIES_PAGE_SIZE: 100
} as const
