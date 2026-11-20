import type { Company, Job, JobDetail, Paginated, SourcesResponse } from '@codehired/shared/api'
import { companiesPath, companyPath, jobPath, jobsPath, SOURCES_PATH } from '../services/api.ts'
import type { JobsQuery } from '../services/api.ts'
import { useFetch } from './useFetch.ts'

export function useJobs (filters: JobsQuery) {
  const { data, error, loading } = useFetch<Paginated<Job>>(jobsPath(filters))

  return {
    jobs: data?.data ?? [],
    total: data?.total ?? 0,
    error,
    loading
  }
}

export function useJob (id: string) {
  const { data, error, loading } = useFetch<JobDetail>(jobPath(id))
  return { job: data, error, loading }
}

// Companies with open jobs, the most open jobs first
export function useCompanies ({ limit }: { limit: number }) {
  const { data, error, loading } = useFetch<Paginated<Company>>(companiesPath({ limit }))
  return { companies: data?.data ?? [], total: data?.total ?? 0, error, loading }
}

export function useCompany (slug: string) {
  const { data, error, loading } = useFetch<Company>(companyPath(slug))
  return { company: data, error, loading }
}

// Every data source and when the jobs were last refreshed (`updatedAt`)
export function useSources () {
  const { data, error, loading } = useFetch<SourcesResponse>(SOURCES_PATH)

  return {
    sources: data?.data ?? [],
    updatedAt: data?.updatedAt ?? null,
    error,
    loading
  }
}
