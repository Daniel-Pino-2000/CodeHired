import type { CookieOptions, Request } from 'express'
import { jwtVerify, SignJWT } from 'jose'
import { CONFIG } from '../config.js'

const ISSUER = 'codehired'
const ALGORITHM = 'HS256'

function secretKey () {
  if (!CONFIG.JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(CONFIG.JWT_SECRET)
}

// A session is a signed JWT whose subject is the user's id, valid for SESSION_DAYS
export async function signSession (userId: number) {
  return await new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${CONFIG.SESSION_DAYS}d`)
    .sign(secretKey())
}

// The user id of a valid session; null when the token is missing, expired, forged or malformed
export async function verifySession (token: string | undefined): Promise<number | null> {
  if (!token) return null
  const key = secretKey()
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: [ALGORITHM] })
    const id = Number(payload.sub)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

// httpOnly so page scripts never see the token, sameSite=lax so other sites cannot send it with
// their POSTs. Secure everywhere but local development, where the API runs on plain http.
export function sessionCookieOptions ({ isDevelopment = CONFIG.IS_DEVELOPMENT } = {}): CookieOptions {
  return { httpOnly: true, secure: !isDevelopment, sameSite: 'lax', path: '/' }
}

// The session cookie of a request. Parsed by hand: it is the only cookie the API reads.
export function readSessionCookie (req: Request) {
  const header = req.header('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== CONFIG.SESSION_COOKIE) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}
