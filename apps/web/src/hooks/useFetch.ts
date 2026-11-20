import { useEffect, useState } from 'react'
import { getJson } from '../services/api.ts'

interface FetchResult<T> {
  // The path `data` or `error` belongs to
  path: string | null
  data: T | null
  error: Error | null
}

// Fetches `path` from the API whenever it changes. `T` is what the route answers with. While a
// new request is in flight the previous data is kept, so lists don't flash empty between pages.
export function useFetch<T> (path: string) {
  const [result, setResult] = useState<FetchResult<T>>({ path: null, data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()

    getJson<T>(path, { signal: controller.signal })
      .then((data) => setResult({ path, data, error: null }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setResult({ path, data: null, error })
      })

    return () => controller.abort()
  }, [path])

  const loading = result.path !== path

  return {
    data: result.data,
    error: loading ? null : result.error,
    loading
  }
}
