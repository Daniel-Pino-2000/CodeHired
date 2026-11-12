import { Link, useParams } from 'react-router'
import { useJob } from '../hooks/useJobs.js'
import {
  employmentTypeLabel,
  formatSalary,
  levelLabel,
  sourceLabel,
  technologyLabel,
  timeAgo,
  workplaceLabel
} from '../utils/format.js'
import NotFoundPage from './NotFound.jsx'
import styles from './JobDetail.module.css'

// Links to postings on other sites. The sources' terms ask for a plain followed link (no
// rel="nofollow"), and `noopener` keeps the other site from reaching back into this tab.
function ExternalLink ({ href, className, children }) {
  return (
    <a href={href} className={className} target='_blank' rel='noopener noreferrer'>
      {children}
    </a>
  )
}

export default function JobDetailPage () {
  const { id } = useParams()
  const { job, loading, error } = useJob(id)

  if (error?.status === 404) return <NotFoundPage message="This job doesn't exist or was removed." />

  return (
    <article className={`container ${styles.page}`}>
      <Link to='/search' className={styles.back}>← Back to jobs</Link>

      {error && <p role='alert' className={styles.error}>Couldn't load this job: {error.message}</p>}
      {loading && <div className={styles.skeleton} aria-busy='true' aria-label='Loading job' />}

      {job && !loading && <JobDetail job={job} />}
    </article>
  )
}

function JobDetail ({ job }) {
  const { source } = job
  const publisher = source && sourceLabel(source)

  return (
    <>
      <title>{`${job.title} at ${job.company} · CodeHired`}</title>

      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden='true'>{job.company.charAt(0)}</div>
        <div className={styles.heading}>
          <h1 className={styles.title}>{job.title}</h1>
          <p className={styles.meta}>
            {job.company} · {job.location} · <time dateTime={job.createdAt}>Posted {timeAgo(job.createdAt)}</time>
          </p>
          {/* Required by the sources' terms: name the source and link back to the original posting */}
          {source && (
            <p className={styles.source}>
              Found on <ExternalLink href={source.url}>{publisher}</ExternalLink>
            </p>
          )}
        </div>
        {/* Applications happen on the original posting; jobs created here (the local demo data)
            have none */}
        {source
          ? <ExternalLink href={source.url} className='button button-primary'>Apply on {publisher} ↗</ExternalLink>
          : <p className={styles.sample}>Sample job: there is no posting to apply to</p>}
      </header>

      <div className={styles.layout}>
        <section className={styles.description}>
          <h2>About the role</h2>
          {job.description.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {/* Some sources only give a snippet: the rest is on the posting */}
          {source && job.descriptionIsSnippet && (
            <p>
              <ExternalLink href={source.url} className={styles.readMore}>
                Read the full description on {publisher} ↗
              </ExternalLink>
            </p>
          )}
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

          {job.technologies.length > 0 && (
            <>
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
            </>
          )}

          {/* The same opening found on other sources (see deduplication in the README) */}
          {job.alsoPostedOn?.length > 0 && (
            <>
              <h2 className={styles.summaryTitle}>Also posted on</h2>
              <ul className={styles.sources}>
                {job.alsoPostedOn.map((other) => (
                  <li key={other.url}>
                    <ExternalLink href={other.url}>{sourceLabel(other)}</ExternalLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  )
}
