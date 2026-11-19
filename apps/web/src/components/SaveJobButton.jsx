import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import { useFavoritesStore } from '../store/favoritesStore.js'
import { loginPath } from '../utils/auth.js'
import styles from './SaveJobButton.module.css'

function BookmarkIcon ({ filled }) {
  return (
    <svg className={styles.icon} viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
      <path
        d='M6 3.5h12a1 1 0 0 1 1 1v16l-7-4.5-7 4.5v-16a1 1 0 0 1 1-1Z'
        fill={filled ? 'currentColor' : 'none'}
        stroke='currentColor'
        strokeWidth='1.8'
        strokeLinejoin='round'
      />
    </svg>
  )
}

// Saves a job for the signed-in user. `compact` is the icon-only button on job cards; the detail
// page shows a labelled one. Signed out, it is a link to the login page that brings you back.
export function SaveJobButton ({ job, compact = false }) {
  const user = useAuthStore((state) => state.user)
  const authStatus = useAuthStore((state) => state.status)
  const saved = useFavoritesStore((state) => state.ids.has(job.id))
  const busy = useFavoritesStore((state) => state.pending.has(job.id))
  const ready = useFavoritesStore((state) => state.status === 'ready')
  const toggle = useFavoritesStore((state) => state.toggle)
  const location = useLocation()
  const [failed, setFailed] = useState(null)

  const className = `${styles.button} ${compact ? styles.compact : 'button button-secondary'} ${saved ? styles.saved : ''}`

  // Nothing until GET /auth/me answers, so a signed-in user never sees the sign-in link flash
  if (authStatus === 'loading') return <span className={compact ? styles.placeholder : undefined} />

  if (!user) {
    return (
      <Link to={loginPath(location)} className={className} title='Sign in to save jobs' aria-label={compact ? 'Sign in to save jobs' : undefined}>
        <BookmarkIcon />
        {!compact && 'Sign in to save'}
      </Link>
    )
  }

  const handleClick = async () => {
    setFailed(null)
    try {
      await toggle(job)
    } catch (error) {
      // A session that expired turns this button into the sign-in link: nothing else to say
      if (error.status !== 401) {
        setFailed(saved ? "Couldn't remove this job. Try again." : "Couldn't save this job. Try again.")
      }
    }
  }

  return (
    <span className={styles.wrapper}>
      <button
        type='button'
        className={className}
        onClick={handleClick}
        disabled={!ready}
        aria-busy={busy}
        // Icon only: a toggle with a fixed name. With text, the text says what it does.
        aria-pressed={compact ? saved : undefined}
        aria-label={compact ? `Save ${job.title}` : undefined}
        title={compact ? (saved ? 'Saved' : 'Save job') : undefined}
      >
        <BookmarkIcon filled={saved} />
        {!compact && (saved ? 'Saved' : 'Save job')}
      </button>
      {failed && <span role='alert' className={compact ? 'visually-hidden' : styles.error}>{failed}</span>}
    </span>
  )
}
