import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ActiveFilters } from '../components/ActiveFilters.jsx'
import { JobList } from '../components/JobList.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { SearchFilters } from '../components/SearchFilters.jsx'
import { MAIN_FILTER_KEYS, MORE_FILTER_KEYS, PAGE_SIZE, RELEVANCE_SORT, SORTS } from '../config.js'
import { useJobs, useSources } from '../hooks/useJobs.js'
import { updatedAgo } from '../utils/format.js'
import styles from './Search.module.css'

const FILTER_KEYS = [...MAIN_FILTER_KEYS, ...MORE_FILTER_KEYS]

// All search state lives in the URL, so results can be shared, bookmarked and survive a reload
export default function SearchPage () {
  const sortId = useId()
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']))
  const sort = searchParams.get('sort') ?? ''
  const currentPage = Math.max(1, Number(searchParams.get('page')) || 1)

  // A text search is ranked by relevance unless another order is picked; "Best match" only
  // exists while there is text to match. The default order stays out of the URL.
  const isTextSearch = Boolean(filters.text.trim())
  const sortOptions = isTextSearch ? [RELEVANCE_SORT, ...SORTS] : SORTS
  const defaultSort = sortOptions[0].value
  const activeSort = sortOptions.some((option) => option.value === sort) ? sort : defaultSort

  const { jobs, total, loading, error } = useJobs({
    ...filters,
    sort: activeSort,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE
  })

  const { sources, updatedAt } = useSources()

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

  // Any change of filters or order starts again from the first page
  const handleFiltersChange = (changes) => updateParams({ ...changes, page: null })
  const handleRemove = (key) => handleFiltersChange({ [key]: null })
  // Clears the filters, keeps the order
  const handleClear = () => setSearchParams(sort ? { sort } : {}, { replace: true })

  const handlePageChange = (page) => {
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
            value={activeSort}
            onChange={(event) => handleFiltersChange({ sort: event.target.value === defaultSort ? null : event.target.value })}
          >
            {sortOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <JobList jobs={jobs} loading={loading} error={error} />

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
    </section>
  )
}
