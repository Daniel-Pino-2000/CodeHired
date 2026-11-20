import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useApplicationsStore } from '../store/applicationsStore.js'
import { useAuthStore } from '../store/authStore.js'
import { localToday, statusLabel } from '../utils/applications.js'
import { loginPath } from '../utils/auth.js'
import { formatCalendarDate } from '../utils/format.js'
import styles from './ApplicationPrompt.module.css'

// The job page's application line. After the candidate followed "Apply on ..." and came back
// (`asking`), it asks whether they applied and records it with one click. A job they already
// track shows where it stands instead, and one they don't can still be tracked from here.
export function ApplicationPrompt ({ job, asking, onDismiss }) {
  const user = useAuthStore((state) => state.user)
  const application = useApplicationsStore((state) => state.byJob.get(job.id))
  const ready = useApplicationsStore((state) => state.status === 'ready')
  const add = useApplicationsStore((state) => state.add)
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)

  if (!user) {
    if (!asking) return null
    return (
      <div className={`${styles.prompt} ${styles.asking}`} role='status'>
        <p className={styles.text}>
          Applied? <Link to={loginPath(location)}>Sign in</Link> to track every application in one place.
        </p>
        <button type='button' className={styles.link} onClick={onDismiss}>Dismiss</button>
      </div>
    )
  }

  if (!ready) return null

  if (application) {
    return (
      <div className={`${styles.prompt} ${styles.tracked}`} role='status'>
        <p className={styles.text}>
          {application.appliedAt
            ? <>You applied on <time dateTime={application.appliedAt}>{formatCalendarDate(application.appliedAt)}</time></>
            : 'In your applications'}
          {application.status !== 'applied' && <> · <strong>{statusLabel(application.status)}</strong></>}
        </p>
        <Link to='/applications' className={styles.link}>See your applications</Link>
      </div>
    )
  }

  const track = async () => {
    setBusy(true)
    setFailed(null)
    try {
      await add({ jobId: job.id, status: 'applied', appliedAt: localToday() })
      onDismiss()
    } catch (error) {
      // 409: tracked in another tab, and the store is reloading to show it. 401: signed out.
      if (error.status !== 409 && error.status !== 401) setFailed("Couldn't record it. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (asking) {
    return (
      <div className={`${styles.prompt} ${styles.asking}`} role='status'>
        <p className={styles.text}><strong>Did you apply?</strong> Track it with your other applications.</p>
        <div className={styles.buttons}>
          <button type='button' className='button button-primary' onClick={track} disabled={busy} aria-busy={busy}>
            Yes, I applied
          </button>
          <button type='button' className='button button-secondary' onClick={onDismiss} disabled={busy}>Not yet</button>
        </div>
        {failed && <p role='alert' className={styles.error}>{failed}</p>}
      </div>
    )
  }

  return (
    <div className={styles.prompt}>
      <p className={styles.text}>
        Already applied?{' '}
        <button type='button' className={styles.link} onClick={track} disabled={busy} aria-busy={busy}>Track this application</button>
      </p>
      {failed && <p role='alert' className={styles.error}>{failed}</p>}
    </div>
  )
}
