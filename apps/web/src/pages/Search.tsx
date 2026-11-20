import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ActiveFilters } from '../components/ActiveFilters.tsx'
import { JobList } from '../components/JobList.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { SearchFilters } from '../components/SearchFilters.tsx'
import { MAIN_FILTER_KEYS, MORE_FILTER_KEYS, PAGE_SIZE, SORTS } from '../config.ts'
import type { FilterKey, SearchFilterValues } from '../config.ts'
import { useJobs, useSources } from '../hooks/useJobs.ts'
import { updatedAgo } from '../utils/format.ts'
import styles from './Search.module.css'

const FILTER_KEYS = [...MAIN_FILTER_KEYS, ...MORE_FILTER_KEYS]

// All search state lives in the URL, so results can be shared, bookmarked and survive a reload
export default function SearchPage () {
  const sortId = useId()
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ''])) as SearchFilterValues
  const sort = searchParams.get('sort') ?? ''
  const currentPage = Math.max(1, Number(searchParams.get('page')) || 1)

  const { jobs, total, loading, error } = useJobs({
    ...filters,
    sort,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE
  })

  const { sources, updatedAt } = useSources()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // An empty value (or null) removes the parameter
  const updateParams = (changes: Record<string, string | number | null | undefined>) => {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, String(value))
        else params.delete(key)
      }
      return params
    }, { replace: true })
  }

  // Any change of filters or order starts again from the first page
  const handleFiltersChange = (changes: Partial<Record<FilterKey | 'sort', string | null>>) => updateParams({ ...changes, page: null })
  const handleRemove = (key: FilterKey) => handleFiltersChange({ [key]: null })
  // Clears the filters, keeps the order
  const handleClear = () => setSearchParams(sort ? { sort } : {}, { replace: true })

  const handlePageChange = (page: number) => {
    updateParams({ page: page === 1 ? null : page })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className={`container ${styles.page}`}>
      <title>{filters.text ? `"${filters.text}" jobs · CodeHired` : 'Search jobs · CodeHired'}</title>

      <header className={styles.header}>
        <h1>Find your next role</h1>
        <p className={styles.subtitle}>Search by keyword, technology, level, place, date and salary.</p>
        {updatedAt && (
          <p className={styles.updated}>
            Updated <time dateTime={updatedAt}>{updatedAgo(updatedAt)}</time> from{' '}
            <Link to='/sources'>these sources</Link>
          </p>
        )}
      </header>

      <SearchFilters filters={filters} sources={sources} onChange={handleFiltersChange} />
      <ActiveFilters filters={filters} sources={sources} onRemove={handleRemove} onClear={handleClear} />

      <div className={styles.results}>
        <p className={styles.count} aria-live='polite'>
          {!error && !loading && `${total} ${total === 1 ? 'job' : 'jobs'} found`}
        </p>

        <div className={styles.sort}>
          <label htmlFor={sortId}>Sort by</label>
          <select
            id={sortId}
            className='select'
            value={sort || 'newest'}
            onChange={(event) => handleFiltersChange({ sort: event.target.value === 'newest' ? null : event.target.value })}
          >
            {SORTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <JobList jobs={jobs} loading={loading} error={error} />

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
    </section>
  )
}
