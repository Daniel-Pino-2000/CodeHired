import type { Job, JobSource } from '@codehired/shared/api'
import { EMPLOYMENT_TYPES, LEVELS, TECHNOLOGY_LABELS, WORKPLACES } from '../config.ts'
import type { Option } from '../config.ts'

// Takes any string: filters come from the URL, where anything can be typed. An unknown value reads as is.
const findLabel = (options: Option[], value: string) => options.find((option) => option.value === value)?.label ?? value

export const levelLabel = (value: string) => findLabel(LEVELS, value)
export const workplaceLabel = (value: string) => findLabel(WORKPLACES, value)
export const employmentTypeLabel = (value: string) => findLabel(EMPLOYMENT_TYPES, value)
// One slug ("node" → "Node.js"), or a list of them as the technology filter holds it
// ("react,node" → "React, Node.js")
export const technologyLabel = (value: string) =>
  value.split(',').map((slug) => TECHNOLOGY_LABELS[slug.trim()] ?? slug.trim()).filter(Boolean).join(', ')

// Who to name for a posting: the site that published it when the source collects jobs from others
// (JSearch → "LinkedIn"), otherwise the source itself ("Greenhouse", "Remote OK")
export const sourceLabel = (source: Pick<JobSource, 'name' | 'publisher'>) => source.publisher ?? source.name

// Salaries under 1000 are hourly rates (contracts), everything else is yearly
export function formatSalary ({ salaryMin, salaryMax, currency }: Pick<Job, 'salaryMin' | 'salaryMax' | 'currency'>) {
  const highest = salaryMax ?? salaryMin
  if (highest == null) return null

  const isHourly = highest < 1000
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: isHourly ? 'standard' : 'compact',
    maximumFractionDigits: 0
  })

  const range = salaryMin != null && salaryMax != null
    ? `${formatter.format(salaryMin)} – ${formatter.format(salaryMax)}`
    : formatter.format(highest)

  return `${range} ${isHourly ? '/ hour' : '/ year'}`
}

const calendarDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// "Dec 2, 2026", in the reader's time zone
export const formatDate = (isoDate: string) => calendarDate.format(new Date(isoDate))

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const DAY_MS = 24 * 60 * 60 * 1000

// "3 hours ago", for things that change several times a day, like the last ingestion run
export function updatedAgo (isoDate: string) {
  const minutes = Math.round((new Date(isoDate).getTime() - Date.now()) / 60_000)

  if (minutes > -1) return 'just now'
  if (minutes > -60) return relativeTime.format(minutes, 'minute')
  if (minutes > -48 * 60) return relativeTime.format(Math.trunc(minutes / 60), 'hour')
  return timeAgo(isoDate)
}

export function timeAgo (isoDate: string) {
  const days = Math.round((new Date(isoDate).getTime() - Date.now()) / DAY_MS)

  if (days > -7) return relativeTime.format(days, 'day')
  if (days > -30) return relativeTime.format(Math.trunc(days / 7), 'week')
  return relativeTime.format(Math.trunc(days / 30), 'month')
}

// A calendar date from the API (YYYY-MM-DD, no time zone) as "Dec 2, 2026". Read as a local date:
// `new Date('2026-12-02')` would be midnight UTC, the day before in the Americas.
export function formatCalendarDate (date: string) {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return calendarDate.format(new Date(year, month - 1, day))
}
