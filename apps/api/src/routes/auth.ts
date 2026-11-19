import { Router } from 'express'
import { AuthController } from '../controllers/auth.js'
import { authRateLimit, type RateLimitOptions } from '../middlewares/auth.js'

// A function, so every app (and every test) gets its own rate-limit counters
export function createAuthRouter ({ rateLimit }: { rateLimit?: RateLimitOptions } = {}) {
  const router = Router()

  // Only failed logins count, so someone who signs in often is never locked out
  router.post('/login', authRateLimit(rateLimit, { skipSuccessfulRequests: true }), AuthController.login)
  router.post('/register', authRateLimit(rateLimit), AuthController.register)
  router.post('/logout', AuthController.logout)
  router.get('/me', AuthController.me)

  return router
}
