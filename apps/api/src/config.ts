export const CONFIG = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_PATH: process.env.DATABASE_PATH ?? 'codehired.db',
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50
} as const
