import { z } from 'zod'
import { TECHNOLOGY_SLUGS } from '../ingest/technologies.js'
import { LEVELS, WORKPLACES } from '../types.js'
import { MAX_TECHNOLOGY_FILTER } from './job.js'

// Forms send '' for a field left blank: that clears it
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().default(null))

// Only web links: the profile shows them as links, so `javascript:` must never get in. `hostname`
// keeps each link to its site ("www.linkedin.com", "linkedin.com", "uk.linkedin.com").
const link = (hostname?: RegExp, site?: string) => z.preprocess(
  emptyToNull,
  z.url({
    protocol: /^https?$/,
    ...(hostname && { hostname }),
    error: site ? `Enter a ${site} link that starts with https://` : 'Enter a link that starts with https://'
  }).max(2048).nullable().default(null)
)

export const MAX_SKILLS = MAX_TECHNOLOGY_FILTER

// Technology slugs from the dictionary jobs are tagged with: anything else could never match a job
const skills = z.array(z.string().trim().toLowerCase())
  .max(MAX_SKILLS, `List at most ${MAX_SKILLS} skills`)
  .transform((slugs) => [...new Set(slugs)])
  .refine((slugs) => slugs.every((slug) => TECHNOLOGY_SLUGS.has(slug)), 'Pick skills from the list')
  .default([])

// PUT /me/profile: the whole profile. A field left out is cleared, like one sent blank.
export const profileSchema = z.object({
  headline: optionalText(120),
  location: optionalText(100),
  bio: z.string().trim().max(2000).default(''),
  skills,
  yearsOfExperience: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(60).nullable().default(null)),
  desiredLevel: z.preprocess(emptyToNull, z.enum(LEVELS).nullable().default(null)),
  desiredWorkplace: z.preprocess(emptyToNull, z.enum(WORKPLACES).nullable().default(null)),
  links: z.object({
    github: link(/^(www\.)?github\.com$/, 'GitHub'),
    linkedin: link(/^([a-z]{2,3}\.)?linkedin\.com$/, 'LinkedIn'),
    portfolio: link()
  }).default({ github: null, linkedin: null, portfolio: null }),
  resumeUrl: link()
})

export type ProfileInput = z.infer<typeof profileSchema>
