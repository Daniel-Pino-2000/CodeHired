import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useJob } from '../hooks/useJobs.js'
import {
  employmentTypeLabel,
  formatSalary,
  levelLabel,
  technologyLabel,
  timeAgo,
  workplaceLabel
} from '../utils/format.js'
import NotFoundPage from './NotFound.jsx'
import styles from './JobDetail.module.css'

// Keyed by id so per-job state (like `applied`) resets when navigating between jobs
export default function JobDetailPage () {
  const { id } = useParams()
  return <JobDetail key={id} id={id} />
}

function JobDetail ({ id }) {
  const { job, loading, error } = useJob(id)

  // Local only for now: the application tracker issue will persist this on the API
  const [applied, setApplied] = useState(false)

  if (error?.status === 404) return <NotFoundPage message="This job doesn't exist or was removed." />

  return (
    <article className={`container ${styles.page}`}>
      <Link to='/search' className={styles.back}>← Back to jobs</Link>

      {error && <p role='alert' className={styles.error}>Couldn't load this job: {error.message}</p>}
      {loading && <div className={styles.skeleton} aria-busy='true' aria-label='Loading job' />}

      {job && !loading && (
        <>
          <title>{`${job.title} at ${job.company} · CodeHired`}</title>

          <header className={styles.header}>
            <div className={styles.avatar} aria-hidden='true'>{job.company.charAt(0)}</div>
            <div className={styles.heading}>
              <h1 className={styles.title}>{job.title}</h1>
              <p className={styles.meta}>
                {job.company} · {job.location} · <time dateTime={job.createdAt}>Posted {timeAgo(job.createdAt)}</time>
              </p>
            </div>
            <button
              type='button'
              className={`button ${applied ? 'button-success' : 'button-primary'}`}
              onClick={() => setApplied(!applied)}
              aria-pressed={applied}
            >
              {applied ? '✓ Applied' : 'Apply now'}
            </button>
          </header>

          <div className={styles.layout}>
            <section className={styles.description}>
              <h2>About the role</h2>
              {job.description.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>

            <aside className={styles.summary} aria-label='Job summary'>
              <dl>
                <div>
                  <dt>Salary</dt>
                  <dd>{formatSalary(job) ?? 'Not disclosed'}</dd>
                </div>
                <div>
                  <dt>Workplace</dt>
                  <dd>{workplaceLabel(job.workplace)}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{levelLabel(job.level)}</dd>
                </div>
                <div>
                  <dt>Contract</dt>
                  <dd>{employmentTypeLabel(job.employmentType)}</dd>
                </div>
              </dl>

              <h2 className={styles.summaryTitle}>Tech stack</h2>
              <ul className={styles.tags}>
                {job.technologies.map((technology) => (
                  <li key={technology}>
                    <Link to={`/search?technology=${encodeURIComponent(technology)}`} className='tag tag-brand'>
                      {technologyLabel(technology)}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </>
      )}
    </article>
  )
}
