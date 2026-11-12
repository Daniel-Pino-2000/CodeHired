import type { Request, Response } from 'express'
import { z } from 'zod'
import { CompanyModel } from '../models/company.js'
import { COMPANY_SLUG, companyFiltersSchema } from '../schemas/job.js'

export class CompanyController {
  static async getAll (req: Request, res: Response) {
    const result = companyFiltersSchema.safeParse(req.query)

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: z.flattenError(result.error).fieldErrors
      })
    }

    return res.json(await CompanyModel.getAll(result.data))
  }

  // The company only: its jobs come from GET /jobs?company={slug}, with paging and every filter
  static async getBySlug (req: Request<{ slug: string }>, res: Response) {
    const slug = COMPANY_SLUG.safeParse(req.params.slug)
    const company = slug.success ? await CompanyModel.getBySlug(slug.data) : undefined

    if (!company) {
      return res.status(404).json({ error: 'Company not found' })
    }

    return res.json(company)
  }
}
