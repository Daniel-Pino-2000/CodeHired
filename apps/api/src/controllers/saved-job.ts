import type { Request, Response } from 'express'
import { SavedJobModel } from '../models/saved-job.js'

type JobIdParams = { jobId: string }

// The signed-in user's saved jobs. Every handler runs behind requireAuth, so `req.user` is set.
export class SavedJobController {
  static async getAll (req: Request, res: Response) {
    const data = await SavedJobModel.getAll(req.user!.id)
    return res.json({ data, total: data.length })
  }

  // Idempotent: saving a job twice keeps the first save (and its date)
  static async save (req: Request<JobIdParams>, res: Response) {
    const saved = await SavedJobModel.save(req.user!.id, req.params.jobId)
    if (!saved) return res.status(404).json({ error: 'Job not found' })
    return res.sendStatus(204)
  }

  // Idempotent: removing a job that isn't saved is not an error
  static async remove (req: Request<JobIdParams>, res: Response) {
    await SavedJobModel.remove(req.user!.id, req.params.jobId)
    return res.sendStatus(204)
  }
}
