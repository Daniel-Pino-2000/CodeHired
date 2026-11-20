import type { Request, Response } from 'express'
import { z } from 'zod'
import { ProfileModel } from '../models/profile.js'
import { profileSchema } from '../schemas/profile.js'

// The signed-in user's profile. Every handler runs behind requireAuth, so `req.user` is set.
export class ProfileController {
  static async get (req: Request, res: Response) {
    return res.json(await ProfileModel.get(req.user!.id))
  }

  // Replaces the whole profile. Field errors are keyed by path: `links.github`, `skills`.
  static async save (req: Request, res: Response) {
    const result = profileSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request body', details: fieldErrors(result.error) })
    }
    return res.json(await ProfileModel.save(req.user!.id, result.data))
  }
}

// `{ 'links.github': ['Enter a GitHub link...'] }`: flattenError only keeps the top-level key
function fieldErrors (error: z.ZodError) {
  const details: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.filter((part) => typeof part !== 'number').join('.') || 'body'
    ;(details[key] ??= []).push(issue.message)
  }
  return details
}
