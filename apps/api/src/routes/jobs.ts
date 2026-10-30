import { Router } from 'express'
import { JobController } from '../controllers/job.js'

export const jobsRouter = Router()

jobsRouter.get('/', JobController.getAll)
jobsRouter.get('/:id', JobController.getById)
