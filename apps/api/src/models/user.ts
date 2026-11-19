import type { Row } from '@libsql/client'
import { db } from '../db/database.js'
import type { User, UserRole } from '../types.js'

const USER_COLUMNS = 'id, email, name, role, created_at'

function toUser (row: Row): User {
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role as UserRole,
    createdAt: String(row.created_at)
  }
}

export class UserModel {
  // Null when the email is taken. `email` must already be normalized (trimmed, lowercase).
  static async create ({ email, name, passwordHash }: { email: string, name: string, passwordHash: string }): Promise<User | null> {
    const { rows } = await db.execute({
      sql: `
        INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)
        ON CONFLICT (email) DO NOTHING
        RETURNING ${USER_COLUMNS}
      `,
      args: [email, name, passwordHash]
    })
    return rows.length > 0 ? toUser(rows[0]) : null
  }

  static async getById (id: number): Promise<User | null> {
    const { rows } = await db.execute({ sql: `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, args: [id] })
    return rows.length > 0 ? toUser(rows[0]) : null
  }

  // The only read that returns the hash, for checking a password at login
  static async getCredentials (email: string): Promise<{ user: User, passwordHash: string } | null> {
    const { rows } = await db.execute({
      sql: `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`,
      args: [email]
    })
    if (rows.length === 0) return null
    return { user: toUser(rows[0]), passwordHash: String(rows[0].password_hash) }
  }
}
