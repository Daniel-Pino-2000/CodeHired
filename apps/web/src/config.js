export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const PAGE_SIZE = 10

import technologies from '@codehired/shared/technologies.json'
import usStates from '@codehired/shared/us-states.json'

// Display names for technology slugs stored in the API. The API tags jobs with the same
// dictionary, so every slug it stores has a label here.
export const TECHNOLOGY_LABELS = Object.fromEntries(
  Object.entries(technologies).map(([slug, { label }]) => [slug, label])
)

// Technologies offered in the search filter
export const TECHNOLOGIES = [
  'javascript', 'typescript', 'react', 'next.js', 'vue', 'node', 'python', 'java',
  'go', 'php', 'react-native', 'sql', 'postgresql', 'docker', 'kubernetes', 'aws'
].map((value) => ({ value, label: TECHNOLOGY_LABELS[value] }))

export const LEVELS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'lead', label: 'Lead' }
]

export const WORKPLACES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' }
]

export const EMPLOYMENT_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' }
]

// Search filters kept in the URL: the main row, then the ones behind "More filters" on small screens
export const MAIN_FILTER_KEYS = ['text', 'technology', 'level', 'workplace']
export const MORE_FILTER_KEYS = ['postedWithin', 'state', 'employmentType', 'minSalary', 'source', 'hasSalary']

// GET /jobs `postedWithin`
export const POSTED_WITHIN = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
]

// GET /jobs `minSalary`, yearly USD
export const MIN_SALARIES = [50000, 75000, 100000, 125000, 150000, 200000].map((value) => ({
  value: String(value),
  label: `$${value / 1000}k+`
}))

// GET /jobs `sort`. With a text search, results are ranked by relevance first
export const RELEVANCE_SORT = { value: 'relevance', label: 'Best match' }
export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'salary_desc', label: 'Highest salary' }
]

// GET /jobs `state`: the same list the API validates against, by name
export const US_STATES = Object.entries(usStates)
  .map(([value, label]) => ({ value, label }))
  .toSorted((a, b) => a.label.localeCompare(b.label))
