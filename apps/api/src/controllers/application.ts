import type { Request, Response } from 'express'
import { z } from 'zod'
import { ApplicationModel } from '../models/application.js'
import { applicationIdSchema, createApplicationSchema, updateApplicationSchema } from '../schemas/application.js'

type IdParams = { id: string }

function invalidBody (res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: 'Invalid request body',
    details: z.flattenError(error).fieldErrors
  })
}

const notFound = (res: Response) => res.status(404).json({ error: 'Application not found' })

// The signed-in user's applications. Every handler runs behind requireAuth, so `req.user` is set.
export class ApplicationController {
  static async getAll (req: Request, res: Response) {
    const data = await ApplicationModel.getAll(req.user!.id)
    return res.json({ data, total: data.length })
  }

  // 201 with the application; 409 when that CodeHired job is already tracked, with the id of the
  // application that tracks it
  static async create (req: Request, res: Response) {
    const result = createApplicationSchema.safeParse(req.body)
    if (!result.success) return invalidBody(res, result.error)

    const created = await ApplicationModel.create(req.user!.id, result.data)
    if ('application' in created) return res.status(201).json(created.application)
    if (created.error === 'job-not-found') return res.status(404).json({ error: 'Job not found' })
    return res.status(409).json({ error: 'You already track this job', id: created.id })
  }

  static async update (req: Request<IdParams>, res: Response) {
    const id = applicationIdSchema.safeParse(req.params.id)
    if (!id.success) return notFound(res)
    const result = updateApplicationSchema.safeParse(req.body)
    if (!result.success) return invalidBody(res, result.error)

    const application = await ApplicationModel.update(req.user!.id, id.data, result.data)
    return application ? res.json(application) : notFound(res)
  }

  // Idempotent: removing an application that isn't there (any more) is not an error
  static async remove (req: Request<IdParams>, res: Response) {
    const id = applicationIdSchema.safeParse(req.params.id)
    if (id.success) await ApplicationModel.remove(req.user!.id, id.data)
    return res.sendStatus(204)
  }
}
