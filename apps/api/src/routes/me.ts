import { Router } from 'express'
import { ApplicationController } from '../controllers/application.js'
import { ProfileController } from '../controllers/profile.js'
import { SavedJobController } from '../controllers/saved-job.js'
import { requireAuth } from '../middlewares/auth.js'

// The signed-in user's own data. Every route added here (favorites #13, applications #14,
// profile #15) is behind requireAuth, so it answers 401 without a valid session.
export const meRouter = Router()

meRouter.use(requireAuth)

meRouter.get('/saved-jobs', SavedJobController.getAll)
meRouter.put('/saved-jobs/:jobId', SavedJobController.save)
meRouter.delete('/saved-jobs/:jobId', SavedJobController.remove)

meRouter.get('/applications', ApplicationController.getAll)
meRouter.post('/applications', ApplicationController.create)
meRouter.patch('/applications/:id', ApplicationController.update)
meRouter.delete('/applications/:id', ApplicationController.remove)

meRouter.get('/profile', ProfileController.get)
meRouter.put('/profile', ProfileController.save)
