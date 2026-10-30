// Preloaded with `--import` before any test file, so it runs before `config.ts` reads the env.
// Every test file runs in its own process and gets its own empty in-memory database.
process.env.DATABASE_URL = ':memory:'
process.env.CORS_ORIGINS = 'http://localhost:5173'

// Tests must never hit the network: code that fetches gets a fake `fetch` injected instead
globalThis.fetch = () => Promise.reject(new Error('Tests must not use the network: inject a fake fetch'))
