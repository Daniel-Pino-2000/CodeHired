import { useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { CompanyAvatar } from '../components/CompanyAvatar.jsx'
import { JobList } from '../components/JobList.jsx'
import { TECHNOLOGIES } from '../config.js'
import { useCompanies, useJobs } from '../hooks/useJobs.js'
import { useAuthStore } from '../store/authStore.js'
import { useProfileStore } from '../store/profileStore.js'
import { levelLabel, technologyLabel, workplaceLabel } from '../utils/format.js'
import { jobsForYouFilters, jobsForYouPath } from '../utils/profile.js'
import styles from './Home.module.css'

const POPULAR_TECHNOLOGIES = ['react', 'typescript', 'node', 'python', 'go', 'docker']
const LATEST_JOBS_COUNT = 5
const HIRING_COMPANIES_COUNT = 8
const JOBS_FOR_YOU_COUNT = 5

// "React, TypeScript · Mid-level · Remote": what the jobs were picked by
function describeFilters ({ technology, level, workplace }) {
  return [technology && technologyLabel(technology), level && levelLabel(level), workplace && workplaceLabel(workplace)]
    .filter(Boolean)
    .join(' · ')
}

// Jobs that use any of the profile's skills, at its level and workplace, for a signed-in user.
// A profile without any of those gets a link to fill them in instead.
function JobsForYou () {
  const signedIn = useAuthStore((state) => Boolean(state.user))
  const profile = useProfileStore((state) => state.profile)
  const status = useProfileStore((state) => state.status)
  if (!signedIn || status !== 'ready') return null

  const filters = jobsForYouFilters(profile)
  if (!filters) {
    return (
      <section className='container'>
        <div className={styles.callout}>
          <div>
            <h2>Get jobs picked for you</h2>
            <p>Add your skills, level and workplace to your profile, and the jobs that fit show up here.</p>
          </div>
          <Link to='/profile' className='button button-primary'>Fill in your profile</Link>
        </div>
      </section>
    )
  }

  return <JobsForYouList filters={filters} path={jobsForYouPath(profile)} />
}

function JobsForYouList ({ filters, path }) {
  const { jobs, total, loading, error } = useJobs({ ...filters, limit: JOBS_FOR_YOU_COUNT, offset: 0 })

  return (
    <section className={`container ${styles.forYou}`}>
      <header className={styles.sectionHeader}>
        <div>
          <h2>Jobs for you</h2>
          <p className={styles.sectionNote}>
            {describeFilters(filters)} · <Link to='/profile'>Edit profile</Link>
          </p>
        </div>
        {total > JOBS_FOR_YOU_COUNT && <Link to={path} className={styles.viewAll}>All {total} matches →</Link>}
      </header>
      <JobList
        jobs={jobs}
        loading={loading}
        error={error}
        emptyMessage='No open jobs match your profile right now. Try adding more skills, or any level or workplace.'
      />
    </section>
  )
}

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

      <JobsForYou />

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
