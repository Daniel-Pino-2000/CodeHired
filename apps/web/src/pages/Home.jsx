import { useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { CompanyAvatar } from '../components/CompanyAvatar.jsx'
import { JobList } from '../components/JobList.jsx'
import { TECHNOLOGIES } from '../config.js'
import { useCompanies, useJobs } from '../hooks/useJobs.js'
import styles from './Home.module.css'

const POPULAR_TECHNOLOGIES = ['react', 'typescript', 'node', 'python', 'go', 'docker']
const LATEST_JOBS_COUNT = 5
const HIRING_COMPANIES_COUNT = 8

// The companies with the most open jobs. Hidden until there are some, and on errors (the job
// list above already reports those).
function HiringCompanies () {
  const { companies } = useCompanies({ limit: HIRING_COMPANIES_COUNT })
  if (companies.length === 0) return null

  return (
    <section className={`container ${styles.companies}`}>
      <header className={styles.sectionHeader}>
        <h2>Companies hiring now</h2>
      </header>
      <ul className={styles.companyList}>
        {companies.map((company) => (
          <li key={company.id}>
            <Link to={`/companies/${company.slug}`} className={styles.company}>
              <CompanyAvatar name={company.name} logoUrl={company.logoUrl} size='sm' />
              <span className={styles.companyText}>
                <span className={styles.companyName}>{company.name}</span>
                <span className={styles.companyJobs}>
                  {company.openJobs} open {company.openJobs === 1 ? 'job' : 'jobs'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function HomePage () {
  const id = useId()
  const navigate = useNavigate()
  const { jobs, loading, error } = useJobs({ limit: LATEST_JOBS_COUNT, offset: 0 })

  const handleSubmit = (event) => {
    event.preventDefault()
    const text = new FormData(event.currentTarget).get('text').trim()
    navigate(text ? `/search?${new URLSearchParams({ text })}` : '/search')
  }

  return (
    <>
      <section className={styles.hero}>
        <div className='container'>
          <p className={styles.eyebrow}>Jobs for developers, by a developer</p>
          <h1 className={styles.title}>
            Get hired for the <span className={styles.highlight}>code</span> you love writing
          </h1>
          <p className={styles.lead}>
            Search US programming jobs from company career pages and trusted job boards by stack,
            level and workplace, then apply on the original posting.
          </p>

          <form className={styles.search} role='search' onSubmit={handleSubmit}>
            <label htmlFor={`${id}-text`} className='visually-hidden'>Search jobs</label>
            <input
              id={`${id}-text`}
              className='input'
              type='search'
              name='text'
              placeholder='Try "frontend", "Python" or a company name'
              autoComplete='off'
            />
            <button type='submit' className='button button-primary'>Search jobs</button>
          </form>

          <ul className={styles.chips} aria-label='Popular technologies'>
            {TECHNOLOGIES.filter(({ value }) => POPULAR_TECHNOLOGIES.includes(value)).map(({ value, label }) => (
              <li key={value}>
                <Link to={`/search?technology=${encodeURIComponent(value)}`} className={styles.chip}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className='container'>
        <header className={styles.sectionHeader}>
          <h2>Latest jobs</h2>
          <Link to='/search' className={styles.viewAll}>View all jobs →</Link>
        </header>
        <JobList jobs={jobs} loading={loading} error={error} emptyMessage='No jobs have been posted yet.' />
      </section>

      <HiringCompanies />
    </>
  )
}
