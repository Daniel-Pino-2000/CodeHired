import { z } from 'zod'

// Trimmed and lowercased before it is checked, so `Ana@Example.com ` and `ana@example.com` are
// the same account
const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

// The upper bound keeps a huge password from tying up the server while it is hashed
const MAX_PASSWORD = 128

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(MAX_PASSWORD),
  name: z.string().trim().min(1).max(100)
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(MAX_PASSWORD)
})
