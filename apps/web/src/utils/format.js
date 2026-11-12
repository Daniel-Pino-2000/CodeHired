import { EMPLOYMENT_TYPES, LEVELS, TECHNOLOGY_LABELS, WORKPLACES } from '../config.js'

const findLabel = (options, value) => options.find((option) => option.value === value)?.label ?? value

export const levelLabel = (value) => findLabel(LEVELS, value)
export const workplaceLabel = (value) => findLabel(WORKPLACES, value)
export const employmentTypeLabel = (value) => findLabel(EMPLOYMENT_TYPES, value)
export const technologyLabel = (value) => TECHNOLOGY_LABELS[value] ?? value

// Who to name for a posting: the site that published it when the source collects jobs from others
// (JSearch → "LinkedIn"), otherwise the source itself ("Greenhouse", "Remote OK")
export const sourceLabel = (source) => source.publisher ?? source.name

// Salaries under 1000 are hourly rates (contracts), everything else is yearly
export function formatSalary ({ salaryMin, salaryMax, currency }) {
  if (salaryMin == null && salaryMax == null) return null

  const isHourly = (salaryMax ?? salaryMin) < 1000
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: isHourly ? 'standard' : 'compact',
    maximumFractionDigits: 0
  })

  const range = salaryMin != null && salaryMax != null
    ? `${formatter.format(salaryMin)} – ${formatter.format(salaryMax)}`
    : formatter.format(salaryMin ?? salaryMax)

  return `${range} ${isHourly ? '/ hour' : '/ year'}`
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const DAY_MS = 24 * 60 * 60 * 1000

// "3 hours ago", for things that change several times a day, like the last ingestion run
export function updatedAgo (isoDate) {
  const minutes = Math.round((new Date(isoDate).getTime() - Date.now()) / 60_000)

  if (minutes > -1) return 'just now'
  if (minutes > -60) return relativeTime.format(minutes, 'minute')
  if (minutes > -48 * 60) return relativeTime.format(Math.trunc(minutes / 60), 'hour')
  return timeAgo(isoDate)
}

export function timeAgo (isoDate) {
  const days = Math.round((new Date(isoDate).getTime() - Date.now()) / DAY_MS)

  if (days > -7) return relativeTime.format(days, 'day')
  if (days > -30) return relativeTime.format(Math.trunc(days / 7), 'week')
  return relativeTime.format(Math.trunc(days / 30), 'month')
}
