import { Link } from 'react-router'
import { JobList } from '../components/JobList.jsx'
import { useFavoritesStore } from '../store/favoritesStore.js'
import styles from './Saved.module.css'

// The signed-in user's saved jobs, most recently saved first. Behind ProtectedRoute. The list is
// the favorites store's, so removing a job here, on a card or on its page shows everywhere.
export default function SavedPage () {
  const jobs = useFavoritesStore((state) => state.jobs)
  const status = useFavoritesStore((state) => state.status)
  const error = useFavoritesStore((state) => state.error)
  const load = useFavoritesStore((state) => state.load)

  // 'idle' only lasts until App.jsx starts loading for the user who just signed in
  const loading = status === 'idle' || status === 'loading'

  return (
    <section className={`container ${styles.page}`}>
      <title>Saved jobs · CodeHired</title>

      <header className={styles.header}>
        <div>
          <h1>Saved jobs</h1>
          {status === 'ready' && (
            <p className={styles.count}>{jobs.length === 1 ? '1 job' : `${jobs.length} jobs`}</p>
          )}
        </div>
        <Link to='/search' className='button button-secondary'>Browse jobs</Link>
      </header>

      <JobList
        jobs={status === 'ready' ? jobs : []}
        loading={loading}
        error={status === 'error' ? error : null}
        emptyMessage='Use the bookmark on any job to keep it here.'
      />

      {status === 'error' && (
        <button type='button' className={`button button-primary ${styles.retry}`} onClick={load}>Try again</button>
      )}
    </section>
  )
}
