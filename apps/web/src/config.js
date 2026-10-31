export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const PAGE_SIZE = 10

import technologies from '@codehired/shared/technologies.json'

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
