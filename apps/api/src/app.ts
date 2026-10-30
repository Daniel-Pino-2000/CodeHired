import express from 'express'
import { cors } from './middlewares/cors.js'
import { errorHandler, notFound } from './middlewares/errors.js'
import { jobsRouter } from './routes/jobs.js'

// The app is created separately from `listen()` so tests can import it without opening a port
export function createApp () {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/jobs', jobsRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
