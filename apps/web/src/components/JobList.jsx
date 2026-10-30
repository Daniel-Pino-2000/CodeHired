import { JobCard } from './JobCard.jsx'
import styles from './JobList.module.css'

export function JobList ({ jobs, loading, error, emptyMessage = 'No jobs match your search.' }) {
  if (error) {
    return (
      <div className={styles.state} role='alert'>
        <p className={styles.stateTitle}>Couldn't load jobs</p>
        <p>{error.message}. Is the API running on the configured URL?</p>
      </div>
    )
  }

  if (loading && jobs.length === 0) {
    return (
      <ul className={styles.list} aria-busy='true' aria-label='Loading jobs'>
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className={styles.skeleton} />
        ))}
      </ul>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className={styles.state}>
        <p className={styles.stateTitle}>Nothing here yet</p>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <ul className={`${styles.list} ${loading ? styles.stale : ''}`} aria-busy={loading}>
      {jobs.map((job) => (
        <li key={job.id}>
          <JobCard job={job} />
        </li>
      ))}
    </ul>
  )
}
