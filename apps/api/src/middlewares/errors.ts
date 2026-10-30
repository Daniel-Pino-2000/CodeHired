import type { NextFunction, Request, Response } from 'express'

export function notFound (req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
}

// Express recognises error handlers by their 4 arguments, so `next` must stay
export function errorHandler (err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
