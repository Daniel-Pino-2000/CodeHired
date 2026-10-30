import { jobPath, jobsPath } from '../services/api.js'
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
