import { Link, useParams, useSearchParams } from 'react-router'
import { CompanyAvatar } from '../components/CompanyAvatar.jsx'
import { JobList } from '../components/JobList.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { PAGE_SIZE } from '../config.js'
import { useCompany, useJobs } from '../hooks/useJobs.js'
import NotFoundPage from './NotFound.jsx'
import styles from './Company.module.css'

const ATS_NAMES = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby' }

const hostname = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function CompanyPage () {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = Math.max(1, Number(searchParams.get('page')) || 1)

  const { company, loading, error } = useCompany(slug)
  // The company's open jobs, through the same listing (and paging) as the search page
  const jobs = useJobs({ company: slug, limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE })

  if (error?.status === 404) return <NotFoundPage message="We don't know this company yet." />

  const handlePageChange = (page) => {
    setSearchParams(page === 1 ? {} : { page: String(page) }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className={`container ${styles.page}`}>
      <Link to='/search' className={styles.back}>← Back to jobs</Link>

      {error && <p role='alert' className={styles.error}>Couldn't load this company: {error.message}</p>}
      {loading && !company && <div className={styles.skeleton} aria-busy='true' aria-label='Loading company' />}

      {company && (
        <>
          <title>{`Jobs at ${company.name} · CodeHired`}</title>
          <header className={styles.header}>
            <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size='lg' />
            <div className={styles.heading}>
              <h1 className={styles.title}>{company.name}</h1>
              <p className={styles.meta}>
                {company.openJobs === 0
                  ? 'No open jobs right now'
                  : `${company.openJobs} open ${company.openJobs === 1 ? 'job' : 'jobs'}`}
                {company.website && (
                  <>
                    {' · '}
                    <a href={company.website} target='_blank' rel='noopener noreferrer'>{hostname(company.website)} ↗</a>
                  </>
                )}
              </p>
              {company.ats && (
                <p className={styles.note}>
                  Jobs straight from {company.name}'s own careers board on {ATS_NAMES[company.ats] ?? company.ats}
                </p>
              )}
            </div>
          </header>
        </>
      )}

      {(company?.openJobs > 0 || jobs.loading) && (
        <>
          <JobList jobs={jobs.jobs} loading={jobs.loading} error={jobs.error} />
          <Pagination currentPage={currentPage} totalPages={Math.ceil(jobs.total / PAGE_SIZE)} onPageChange={handlePageChange} />
        </>
      )}
    </section>
  )
}
