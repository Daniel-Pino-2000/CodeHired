import type { NextFunction, Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { CONFIG } from '../config.js'
import { UserModel } from '../models/user.js'
import type { User } from '../types.js'
import { readSessionCookie, verifySession } from '../utils/session.js'

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth
      user?: User
    }
  }
}

// The signed-in user, or null. A valid token for a deleted account counts as no session.
export async function currentUser (req: Request): Promise<User | null> {
  const id = await verifySession(readSessionCookie(req))
  return id === null ? null : await UserModel.getById(id)
}

// For every route that needs a signed-in user (all of /me/*): 401 without a valid session
export async function requireAuth (req: Request, res: Response, next: NextFunction) {
  const user = await currentUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Sign in to continue' })
  }
  req.user = user
  next()
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
}

// Requests per IP and window. Counts live in memory, so each server instance counts on its own:
// enough to slow down password guessing on a free tier without another service.
export function authRateLimit ({ limit, windowMs }: RateLimitOptions = CONFIG.AUTH_RATE_LIMIT, { skipSuccessfulRequests = false } = {}) {
  return rateLimit({
    limit,
    windowMs,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({ error: 'Too many attempts, try again later' })
    }
  })
}
