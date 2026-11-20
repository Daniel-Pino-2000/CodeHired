import type { EmploymentType, JobSort, Level, PostedWithin, Workplace } from '@codehired/shared/api'
import technologies from '@codehired/shared/technologies.json'
import usStates from '@codehired/shared/us-states.json'

// Same origin by default (Vite's proxy in development), so the session cookie just works
export const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export const PAGE_SIZE = 10

// One choice of a <select>: the value the API takes and how it reads
export interface Option<T extends string = string> {
  value: T
  label: string
}

// The options for a union type, in the labels' order. Typing the labels as `Record<T, string>`
// makes a value the API adds (and this list misses) a compile error.
export const optionsOf = <T extends string>(labels: Record<T, string>): Option<T>[] =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

// Display names for technology slugs stored in the API. The API tags jobs with the same
// dictionary, so every slug it stores has a label here.
export const TECHNOLOGY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(technologies).map(([slug, { label }]) => [slug, label])
)

// Technologies offered in the search filter
export const TECHNOLOGIES: Option[] = [
  'javascript', 'typescript', 'react', 'next.js', 'vue', 'node', 'python', 'java',
  'go', 'php', 'react-native', 'sql', 'postgresql', 'docker', 'kubernetes', 'aws'
].map((value) => ({ value, label: TECHNOLOGY_LABELS[value] ?? value }))

export const LEVELS = optionsOf<Level>({
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  staff: 'Staff',
  lead: 'Lead'
})

export const WORKPLACES = optionsOf<Workplace>({
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site'
})

export const EMPLOYMENT_TYPES = optionsOf<EmploymentType>({
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  internship: 'Internship'
})

// Search filters kept in the URL: the main row, then the ones behind "More filters" on small screens
export const MAIN_FILTER_KEYS = ['text', 'technology', 'level', 'workplace'] as const
export const MORE_FILTER_KEYS = ['postedWithin', 'state', 'employmentType', 'minSalary', 'source', 'hasSalary'] as const

export type FilterKey = (typeof MAIN_FILTER_KEYS)[number] | (typeof MORE_FILTER_KEYS)[number]
// The search page's filters, as the URL holds them: '' when not set
export type SearchFilterValues = Record<FilterKey, string>

// GET /jobs `postedWithin`
export const POSTED_WITHIN = optionsOf<PostedWithin>({
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days'
})

// GET /jobs `minSalary`, yearly USD
export const MIN_SALARIES: Option[] = [50000, 75000, 100000, 125000, 150000, 200000].map((value) => ({
  value: String(value),
  label: `$${value / 1000}k+`
}))

// GET /jobs `sort`
export const SORTS = optionsOf<JobSort>({
  newest: 'Newest',
  salary_desc: 'Highest salary'
})

// GET /jobs `state`: the same list the API validates against, by name
export const US_STATES: Option[] = Object.entries(usStates)
  .map(([value, label]) => ({ value, label }))
  .toSorted((a, b) => a.label.localeCompare(b.label))
