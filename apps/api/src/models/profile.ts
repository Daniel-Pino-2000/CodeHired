import type { Row } from '@libsql/client'
import { db } from '../db/database.js'
import type { ProfileInput } from '../schemas/profile.js'
import type { Level, Profile, Workplace } from '../types.js'

const nullableString = (value: unknown) => (value === null || value === undefined ? null : String(value))

// What GET /me/profile answers before the first save
export const EMPTY_PROFILE: Profile = {
  headline: null,
  location: null,
  bio: '',
  skills: [],
  yearsOfExperience: null,
  desiredLevel: null,
  desiredWorkplace: null,
  links: { github: null, linkedin: null, portfolio: null },
  resumeUrl: null,
  updatedAt: null
}

function toProfile (row: Row): Profile {
  return {
    headline: nullableString(row.headline),
    location: nullableString(row.location),
    bio: String(row.bio),
    skills: JSON.parse(String(row.skills)) as string[],
    yearsOfExperience: row.years_experience === null ? null : Number(row.years_experience),
    desiredLevel: nullableString(row.desired_level) as Level | null,
    desiredWorkplace: nullableString(row.desired_workplace) as Workplace | null,
    links: {
      github: nullableString(row.github_url),
      linkedin: nullableString(row.linkedin_url),
      portfolio: nullableString(row.portfolio_url)
    },
    resumeUrl: nullableString(row.resume_url),
    updatedAt: String(row.updated_at)
  }
}

// The candidate profile. The AI match score (#19) reads it with `get` too.
export class ProfileModel {
  static async get (userId: number): Promise<Profile> {
    const { rows } = await db.execute({ sql: 'SELECT * FROM profiles WHERE user_id = ?', args: [userId] })
    return rows.length > 0 ? toProfile(rows[0]) : EMPTY_PROFILE
  }

  // Creates the profile or replaces it whole
  static async save (userId: number, profile: ProfileInput): Promise<Profile> {
    const { rows } = await db.execute({
      sql: `
        INSERT INTO profiles (user_id, headline, location, bio, skills, years_experience, desired_level,
                              desired_workplace, github_url, linkedin_url, portfolio_url, resume_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          headline          = excluded.headline,
          location          = excluded.location,
          bio               = excluded.bio,
          skills            = excluded.skills,
          years_experience  = excluded.years_experience,
          desired_level     = excluded.desired_level,
          desired_workplace = excluded.desired_workplace,
          github_url        = excluded.github_url,
          linkedin_url      = excluded.linkedin_url,
          portfolio_url     = excluded.portfolio_url,
          resume_url        = excluded.resume_url,
          updated_at        = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        RETURNING *
      `,
      args: [
        userId, profile.headline, profile.location, profile.bio, JSON.stringify(profile.skills),
        profile.yearsOfExperience, profile.desiredLevel, profile.desiredWorkplace,
        profile.links.github, profile.links.linkedin, profile.links.portfolio, profile.resumeUrl
      ]
    })
    return toProfile(rows[0])
  }
}
