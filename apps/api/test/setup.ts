// Preloaded with `--import` before any test file, so it runs before `config.ts` reads the env.
// Every test file runs in its own process and gets its own empty in-memory database.
process.env.DATABASE_PATH = ':memory:'
process.env.CORS_ORIGINS = 'http://localhost:5173'
