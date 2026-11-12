import { companiesPath, companyPath, jobPath, jobsPath, SOURCES_PATH } from '../services/api.js'
import { useFetch } from './useFetch.js'

export function useJobs (filters) {
  const { data, error, loading } = useFetch(jobsPath(filters))

  return {
    jobs: data?.data ?? [],
    total: data?.total ?? 0,
    error,
    loading
  }
}

export function useJob (id) {
  const { data, error, loading } = useFetch(jobPath(id))
  return { job: data, error, loading }
}

// Companies with open jobs, the most open jobs first
export function useCompanies ({ limit }) {
  const { data, error, loading } = useFetch(companiesPath({ limit }))
  return { companies: data?.data ?? [], total: data?.total ?? 0, error, loading }
}

export function useCompany (slug) {
  const { data, error, loading } = useFetch(companyPath(slug))
  return { company: data, error, loading }
}

// Every data source and when the jobs were last refreshed (`updatedAt`)
export function useSources () {
  const { data, error, loading } = useFetch(SOURCES_PATH)

  return {
    sources: data?.data ?? [],
    updatedAt: data?.updatedAt ?? null,
    error,
    loading
  }
}
