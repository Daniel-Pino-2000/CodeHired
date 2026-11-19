import type { NextFunction, Request, Response } from 'express'

export function notFound (req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
}

// What express.json() throws for a body it cannot read: malformed JSON (400), too large (413)...
// `body` holds the raw request body, which can contain a password.
interface HttpError extends Error {
  status?: number
  expose?: boolean
  type?: string
  body?: unknown
}

// Express recognises error handlers by their 4 arguments, so `next` must stay
export function errorHandler (err: HttpError, req: Request, res: Response, next: NextFunction) {
  // The client's mistake: answer it, and log nothing, so a request body never reaches the logs
  if (err.expose && err.status && err.status >= 400 && err.status < 500) {
    const error = err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message
    return res.status(err.status).json({ error })
  }

  delete err.body
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
