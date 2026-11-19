import type { Request, Response } from 'express'
import { z } from 'zod'
import { CONFIG } from '../config.js'
import { currentUser } from '../middlewares/auth.js'
import { UserModel } from '../models/user.js'
import { loginSchema, registerSchema } from '../schemas/auth.js'
import type { User } from '../types.js'
import { hashPassword, verifyNothing, verifyPassword } from '../utils/password.js'
import { sessionCookieOptions, signSession } from '../utils/session.js'

async function startSession (res: Response, user: User) {
  res.cookie(CONFIG.SESSION_COOKIE, await signSession(user.id), {
    ...sessionCookieOptions(),
    maxAge: CONFIG.SESSION_DAYS * 24 * 60 * 60 * 1000
  })
}

const endSession = (res: Response) => res.clearCookie(CONFIG.SESSION_COOKIE, sessionCookieOptions())

// The error never echoes the input: Zod's field errors name the problem, not the value
function invalidBody (res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: 'Invalid request body',
    details: z.flattenError(error).fieldErrors
  })
}

export class AuthController {
  static async register (req: Request, res: Response) {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) return invalidBody(res, result.error)

    const { email, name, password } = result.data
    const user = await UserModel.create({ email, name, passwordHash: await hashPassword(password) })
    if (!user) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    await startSession(res, user)
    return res.status(201).json({ user })
  }

  static async login (req: Request, res: Response) {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) return invalidBody(res, result.error)

    const { email, password } = result.data
    const credentials = await UserModel.getCredentials(email)
    const valid = credentials
      ? await verifyPassword(credentials.passwordHash, password)
      : await verifyNothing(password)

    // The same answer for an unknown email and a wrong password
    if (!credentials || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    await startSession(res, credentials.user)
    return res.json({ user: credentials.user })
  }

  // Sessions are stateless tokens: logging out removes the cookie from the browser
  static logout (_req: Request, res: Response) {
    endSession(res)
    return res.sendStatus(204)
  }

  static async me (req: Request, res: Response) {
    const user = await currentUser(req)
    if (!user) {
      endSession(res)
      return res.status(401).json({ error: 'Not signed in' })
    }
    return res.json({ user })
  }
}
