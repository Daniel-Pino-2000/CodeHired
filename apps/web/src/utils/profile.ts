// Pure helpers for the candidate profile (/me/profile). Only type imports (Node drops them), so
// `node --test` runs them.
import type { Level, Profile, ProfileLinks, Workplace } from '@codehired/shared/api'

// The same limits as the API's schema (apps/api/src/schemas/profile.ts)
export const PROFILE_LIMITS = { headline: 120, location: 100, bio: 2000, skills: 20, url: 2048, yearsOfExperience: 60 }

interface LinkRules {
  // Only links to this site
  hostname?: RegExp
  site?: string
  example?: string
}

// The form's link fields are named like the API's field errors (`links.github`), so a 400 lands
// next to its field
type LinkField = `links.${keyof ProfileLinks}`

// `hostname` matches the API's check
const LINK_FIELDS: Record<LinkField, LinkRules> = {
  'links.github': { hostname: /^(www\.)?github\.com$/, site: 'GitHub', example: 'https://github.com/…' },
  'links.linkedin': { hostname: /^([a-z]{2,3}\.)?linkedin\.com$/, site: 'LinkedIn', example: 'https://www.linkedin.com/in/…' },
  'links.portfolio': {}
}

// The profile form's fields: text as inputs hold it ('' for not set), and the skills' slugs
export interface ProfileFormValues extends Record<LinkField, string> {
  headline: string
  location: string
  bio: string
  skills: string[]
  yearsOfExperience: string
  desiredLevel: Level | ''
  desiredWorkplace: Workplace | ''
  resumeUrl: string
}

export type ProfileField = keyof ProfileFormValues
export type ProfileErrors = Partial<Record<ProfileField, string>>

// PUT /me/profile: the whole profile. Blank text is sent as '', which the API stores as "not set".
export interface ProfileBody {
  headline: string
  location: string
  bio: string
  skills: string[]
  yearsOfExperience: number | null
  desiredLevel: Level | null
  desiredWorkplace: Workplace | null
  links: Record<keyof ProfileLinks, string>
  resumeUrl: string
}

export function toFormValues (profile: Partial<Profile> | null | undefined): ProfileFormValues {
  return {
    headline: profile?.headline ?? '',
    location: profile?.location ?? '',
    bio: profile?.bio ?? '',
    skills: profile?.skills ?? [],
    yearsOfExperience: profile?.yearsOfExperience == null ? '' : String(profile.yearsOfExperience),
    desiredLevel: profile?.desiredLevel ?? '',
    desiredWorkplace: profile?.desiredWorkplace ?? '',
    'links.github': profile?.links?.github ?? '',
    'links.linkedin': profile?.links?.linkedin ?? '',
    'links.portfolio': profile?.links?.portfolio ?? '',
    resumeUrl: profile?.resumeUrl ?? ''
  }
}

const linkEntries = Object.entries(LINK_FIELDS) as [LinkField, LinkRules][]

export function toRequestBody (values: ProfileFormValues): ProfileBody {
  const years = values.yearsOfExperience.trim()
  return {
    headline: values.headline.trim(),
    location: values.location.trim(),
    bio: values.bio.trim(),
    skills: values.skills,
    yearsOfExperience: years === '' ? null : Number(years),
    desiredLevel: values.desiredLevel || null,
    desiredWorkplace: values.desiredWorkplace || null,
    links: {
      github: values['links.github'].trim(),
      linkedin: values['links.linkedin'].trim(),
      portfolio: values['links.portfolio'].trim()
    },
    resumeUrl: values.resumeUrl.trim()
  }
}

function linkError (value: string, { hostname, site, example }: LinkRules = {}) {
  let url
  try {
    url = new URL(value)
  } catch {
    return 'Enter a link that starts with https://'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Enter a link that starts with https://'
  if (hostname && !hostname.test(url.hostname)) return `Enter a ${site} link, like ${example}`
  if (value.length > PROFILE_LIMITS.url) return 'This link is too long'
  return null
}

// Catches most mistakes before a request; the API checks again
export function validateProfile (values: ProfileFormValues) {
  const errors: ProfileErrors = {}
  for (const name of ['headline', 'location', 'bio'] as const) {
    if (values[name].trim().length > PROFILE_LIMITS[name]) errors[name] = `Use at most ${PROFILE_LIMITS[name]} characters`
  }

  const years = values.yearsOfExperience.trim()
  if (years !== '' && !(/^\d+$/.test(years) && Number(years) <= PROFILE_LIMITS.yearsOfExperience)) {
    errors.yearsOfExperience = `Enter a whole number from 0 to ${PROFILE_LIMITS.yearsOfExperience}`
  }

  if (values.skills.length > PROFILE_LIMITS.skills) errors.skills = `List at most ${PROFILE_LIMITS.skills} skills`

  const links: [LinkField | 'resumeUrl', LinkRules][] = [...linkEntries, ['resumeUrl', {}]]
  for (const [name, rules] of links) {
    const value = values[name].trim()
    const error = value && linkError(value, rules)
    if (error) errors[name] = error
  }
  return errors
}

// The technology a typed name means: its label ("Node.js") or its slug ("node"), any case. Null
// when the dictionary (`labels`, slug → label) has no such technology.
export function findSkill (text: string, labels: Record<string, string>) {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null
  if (Object.hasOwn(labels, wanted)) return wanted
  return Object.keys(labels).find((slug) => labels[slug]?.toLowerCase() === wanted) ?? null
}

// GET /jobs filters "Jobs for you" picks jobs by
export interface JobsForYouFilters {
  // Slugs separated by commas: jobs that use any of them
  technology?: string
  level?: Level
  workplace?: Workplace
}

type ProfilePicks = Pick<Profile, 'skills' | 'desiredLevel' | 'desiredWorkplace'>

// GET /jobs filters for "Jobs for you": jobs that use any of the profile's skills, at its level
// and workplace. Null when the profile has none of the three: there is nothing to go on.
export function jobsForYouFilters (profile: ProfilePicks | null | undefined): JobsForYouFilters | null {
  if (!profile) return null
  const filters: JobsForYouFilters = {}
  if (profile.skills?.length) filters.technology = profile.skills.join(',')
  if (profile.desiredLevel) filters.level = profile.desiredLevel
  if (profile.desiredWorkplace) filters.workplace = profile.desiredWorkplace
  return Object.keys(filters).length > 0 ? filters : null
}

// The search page with those filters: `/search?technology=react,node&level=mid`. The commas are
// kept as they are, so the link reads well when shared.
export function jobsForYouPath (profile: ProfilePicks | null | undefined) {
  const filters = jobsForYouFilters(profile)
  return filters ? `/search?${new URLSearchParams({ ...filters })}`.replaceAll('%2C', ',') : '/search'
}

// The links to show, in order, skipping the ones not set
export function profileLinks (profile: { links: Partial<Record<keyof ProfileLinks, string | null>>, resumeUrl: string | null }) {
  return ([
    ['GitHub', profile.links.github],
    ['LinkedIn', profile.links.linkedin],
    ['Portfolio', profile.links.portfolio],
    ['Resume', profile.resumeUrl]
  ] as const).flatMap(([label, url]) => (url ? [{ label, url }] : []))
}

// "4 years of experience"
export function experienceLabel (years: number | null | undefined) {
  if (years == null) return null
  if (years === 0) return 'New to the field'
  return `${years} ${years === 1 ? 'year' : 'years'} of experience`
}
