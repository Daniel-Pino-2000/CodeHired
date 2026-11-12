import { Router } from 'express'
import { CompanyController } from '../controllers/company.js'

export const companiesRouter = Router()

companiesRouter.get('/', CompanyController.getAll)
companiesRouter.get('/:slug', CompanyController.getBySlug)
