import { useEffect, useState } from 'react'
import { getJson } from '../services/api.js'

// Fetches `path` from the API whenever it changes. While a new request is in flight
// the previous data is kept, so lists don't flash empty between pages.
export function useFetch (path) {
  const [result, setResult] = useState({ path: null, data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()

    getJson(path, { signal: controller.signal })
      .then((data) => setResult({ path, data, error: null }))
      .catch((error) => {
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
