import { useSearchParams } from 'react-router'
import { JobList } from '../components/JobList.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { SearchFilters } from '../components/SearchFilters.jsx'
import { PAGE_SIZE } from '../config.js'
import { useJobs } from '../hooks/useJobs.js'
import styles from './Search.module.css'

const FILTER_KEYS = ['text', 'technology', 'level', 'workplace']

// All search state lives in the URL, so results can be shared, bookmarked and survive a reload
export default function SearchPage () {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']))
  const currentPage = Math.max(1, Number(searchParams.get('page')) || 1)

  const { jobs, total, loading, error } = useJobs({
    ...filters,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const updateParams = (changes) => {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      return params
    }, { replace: true })
  }

  const handleFiltersChange = (changes) => updateParams({ ...changes, page: null })
  const handleClear = () => setSearchParams({}, { replace: true })

  const handlePageChange = (page) => {
    updateParams({ page: page === 1 ? null : page })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className={`container ${styles.page}`}>
      <title>{filters.text ? `"${filters.text}" jobs · CodeHired` : 'Search jobs · CodeHired'}</title>

      <header className={styles.header}>
        <h1>Find your next role</h1>
        <p className={styles.subtitle}>Search by keyword, technology, experience level and workplace.</p>
      </header>

      <SearchFilters filters={filters} onChange={handleFiltersChange} onClear={handleClear} />

      <p className={styles.count} aria-live='polite'>
        {!error && !loading && `${total} ${total === 1 ? 'job' : 'jobs'} found`}
      </p>

      <JobList jobs={jobs} loading={loading} error={error} />

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
    </section>
  )
}
