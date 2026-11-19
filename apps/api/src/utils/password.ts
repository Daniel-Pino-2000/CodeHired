import { hash, verify } from '@node-rs/argon2'

// argon2id with the library's defaults (19 MiB, 2 passes, 1 lane), the OWASP recommendation.
// The PHC string it returns carries the salt and parameters, so older hashes keep verifying if
// the defaults change.
export const hashPassword = (password: string) => hash(password)

export async function verifyPassword (passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    // A malformed hash in the database is a failed login, not a crash
    return false
  }
}

// Checked when the email is unknown, so a login takes as long whether or not the account exists
let dummyHash: Promise<string> | undefined

export async function verifyNothing (password: string) {
  dummyHash ??= hashPassword('codehired-dummy-password')
  await verifyPassword(await dummyHash, password)
  return false
}
