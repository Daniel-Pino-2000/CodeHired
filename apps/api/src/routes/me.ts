import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'

// The signed-in user's own data. Every route added here (favorites #13, applications #14,
// profile #15) is behind requireAuth, so it answers 401 without a valid session.
export const meRouter = Router()

meRouter.use(requireAuth)
