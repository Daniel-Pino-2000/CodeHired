import type { Request, Response } from 'express'
import { z } from 'zod'
import { JobModel } from '../models/job.js'
import { jobFiltersSchema } from '../schemas/job.js'

export class JobController {
  static getAll (req: Request, res: Response) {
    const result = jobFiltersSchema.safeParse(req.query)

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: z.flattenError(result.error).fieldErrors
      })
    }

    return res.json(JobModel.getAll(result.data))
  }

  static getById (req: Request<{ id: string }>, res: Response) {
    const job = JobModel.getById(req.params.id)

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    return res.json(job)
  }
}
