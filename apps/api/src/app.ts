import express from 'express'
import { CONFIG } from './config.js'
import type { RateLimitOptions } from './middlewares/auth.js'
import { cors } from './middlewares/cors.js'
import { errorHandler, notFound } from './middlewares/errors.js'
import { createAuthRouter } from './routes/auth.js'
import { companiesRouter } from './routes/companies.js'
import { jobsRouter } from './routes/jobs.js'
import { meRouter } from './routes/me.js'
import { sourcesRouter } from './routes/sources.js'

// The app is created separately from `listen()` so tests can import it without opening a port
export function createApp ({ authRateLimit }: { authRateLimit?: RateLimitOptions } = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', CONFIG.TRUST_PROXY)
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/jobs', jobsRouter)
  app.use('/companies', companiesRouter)
  app.use('/sources', sourcesRouter)
  app.use('/auth', createAuthRouter({ rateLimit: authRateLimit }))
  app.use('/me', meRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
