export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const PAGE_SIZE = 10

// Display names for technology slugs stored in the API
export const TECHNOLOGY_LABELS = {
  astro: 'Astro',
  aws: 'AWS',
  celery: 'Celery',
  css: 'CSS',
  django: 'Django',
  docker: 'Docker',
  expo: 'Expo',
  'github-actions': 'GitHub Actions',
  go: 'Go',
  graphql: 'GraphQL',
  grpc: 'gRPC',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  kafka: 'Kafka',
  kubernetes: 'Kubernetes',
  linux: 'Linux',
  'next.js': 'Next.js',
  node: 'Node.js',
  php: 'PHP',
  playwright: 'Playwright',
  postgresql: 'PostgreSQL',
  'power-bi': 'Power BI',
  prometheus: 'Prometheus',
  python: 'Python',
  pytorch: 'PyTorch',
  react: 'React',
  'react-native': 'React Native',
  redis: 'Redis',
  spring: 'Spring',
  sql: 'SQL',
  tailwind: 'Tailwind CSS',
  terraform: 'Terraform',
  typescript: 'TypeScript',
  vite: 'Vite',
  vue: 'Vue',
  wordpress: 'WordPress'
}

// Technologies offered in the search filter
export const TECHNOLOGIES = [
  'javascript', 'typescript', 'react', 'next.js', 'vue', 'node', 'python', 'java',
  'go', 'php', 'react-native', 'sql', 'postgresql', 'docker', 'kubernetes', 'aws'
].map((value) => ({ value, label: TECHNOLOGY_LABELS[value] }))

export const LEVELS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
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
