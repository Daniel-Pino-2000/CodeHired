import { Router } from 'express'
import { SourceController } from '../controllers/source.js'

export const sourcesRouter = Router()

sourcesRouter.get('/', SourceController.getAll)
