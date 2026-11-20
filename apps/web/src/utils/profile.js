// Pure helpers for the candidate profile (/me/profile). No imports, so `node --test` runs them.

// The same limits as the API's schema (apps/api/src/schemas/profile.ts)
export const PROFILE_LIMITS = { headline: 120, location: 100, bio: 2000, skills: 20, url: 2048, yearsOfExperience: 60 }

// The form's link fields are named like the API's field errors (`links.github`), so a 400 lands
// next to its field. `hostname` matches the API's check.
const LINK_FIELDS = {
  'links.github': { key: 'github', hostname: /^(www\.)?github\.com$/, site: 'GitHub', example: 'https://github.com/…' },
  'links.linkedin': { key: 'linkedin', hostname: /^([a-z]{2,3}\.)?linkedin\.com$/, site: 'LinkedIn', example: 'https://www.linkedin.com/in/…' },
  'links.portfolio': { key: 'portfolio' }
}

export function toFormValues (profile) {
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

// PUT /me/profile. Blank text is sent as '', which the API stores as "not set".
export function toRequestBody (values) {
  const trimmed = (name) => values[name].trim()
  return {
    headline: trimmed('headline'),
    location: trimmed('location'),
    bio: trimmed('bio'),
    skills: values.skills,
    yearsOfExperience: trimmed('yearsOfExperience') === '' ? null : Number(trimmed('yearsOfExperience')),
    desiredLevel: values.desiredLevel || null,
    desiredWorkplace: values.desiredWorkplace || null,
    links: Object.fromEntries(Object.entries(LINK_FIELDS).map(([name, { key }]) => [key, trimmed(name)])),
    resumeUrl: trimmed('resumeUrl')
  }
}

function linkError (value, { hostname, site, example } = {}) {
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
export function validateProfile (values) {
  const errors = {}
  for (const name of ['headline', 'location', 'bio']) {
    if (values[name].trim().length > PROFILE_LIMITS[name]) errors[name] = `Use at most ${PROFILE_LIMITS[name]} characters`
  }

  const years = values.yearsOfExperience.trim()
  if (years !== '' && !(/^\d+$/.test(years) && Number(years) <= PROFILE_LIMITS.yearsOfExperience)) {
    errors.yearsOfExperience = `Enter a whole number from 0 to ${PROFILE_LIMITS.yearsOfExperience}`
  }

  if (values.skills.length > PROFILE_LIMITS.skills) errors.skills = `List at most ${PROFILE_LIMITS.skills} skills`

  for (const [name, rules] of [...Object.entries(LINK_FIELDS), ['resumeUrl', {}]]) {
    const value = values[name].trim()
    const error = value && linkError(value, rules)
    if (error) errors[name] = error
  }
  return errors
}

// The technology a typed name means: its label ("Node.js") or its slug ("node"), any case. Null
// when the dictionary (`labels`, slug → label) has no such technology.
export function findSkill (text, labels) {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null
  if (Object.hasOwn(labels, wanted)) return wanted
  return Object.keys(labels).find((slug) => labels[slug].toLowerCase() === wanted) ?? null
}

// GET /jobs filters for "Jobs for you": jobs that use any of the profile's skills, at its level
// and workplace. Null when the profile has none of the three: there is nothing to go on.
export function jobsForYouFilters (profile) {
  if (!profile) return null
  const filters = {}
  if (profile.skills?.length) filters.technology = profile.skills.join(',')
  if (profile.desiredLevel) filters.level = profile.desiredLevel
  if (profile.desiredWorkplace) filters.workplace = profile.desiredWorkplace
  return Object.keys(filters).length > 0 ? filters : null
}

// The search page with those filters: `/search?technology=react,node&level=mid`. The commas are
// kept as they are, so the link reads well when shared.
export function jobsForYouPath (profile) {
  const filters = jobsForYouFilters(profile)
  return filters ? `/search?${new URLSearchParams(filters)}`.replaceAll('%2C', ',') : '/search'
}

// The links to show, in order, skipping the ones not set
export function profileLinks (profile) {
  return [
    ['GitHub', profile.links.github],
    ['LinkedIn', profile.links.linkedin],
    ['Portfolio', profile.links.portfolio],
    ['Resume', profile.resumeUrl]
  ].filter(([, url]) => url).map(([label, url]) => ({ label, url }))
}

// "4 years of experience"
export function experienceLabel (years) {
  if (years == null) return null
  if (years === 0) return 'New to the field'
  return `${years} ${years === 1 ? 'year' : 'years'} of experience`
}
