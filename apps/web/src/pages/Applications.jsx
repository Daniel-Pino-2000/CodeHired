import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ApplicationForm } from '../components/ApplicationForm.jsx'
import { useApplicationsStore } from '../store/applicationsStore.js'
import { APPLICATION_STATUSES, groupByStatus, isFollowUpDue, localToday, toCsv } from '../utils/applications.js'
import { formatCalendarDate } from '../utils/format.js'
import styles from './Applications.module.css'

// Hands the browser a CSV of every application to save
function downloadCsv (applications, today) {
  const url = URL.createObjectURL(new Blob([toCsv(applications)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `codehired-applications-${today}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// Every application the signed-in user tracks, CodeHired jobs and ones added by hand side by
// side, grouped by status. Follow-ups that are due are highlighted. Behind ProtectedRoute.
export default function ApplicationsPage () {
  const applications = useApplicationsStore((state) => state.applications)
  const status = useApplicationsStore((state) => state.status)
  const error = useApplicationsStore((state) => state.error)
  const load = useApplicationsStore((state) => state.load)
  const add = useApplicationsStore((state) => state.add)
  const [adding, setAdding] = useState(false)

  const today = localToday()
  const groups = groupByStatus(applications, today)
  const due = applications.filter((application) => isFollowUpDue(application, today)).length
  // 'idle' only lasts until App.jsx starts loading for the user who just signed in
  const loading = status === 'idle' || status === 'loading'

  const handleAdd = async (body) => {
    await add(body)
    setAdding(false)
  }

  return (
    <section className={`container ${styles.page}`}>
      <title>Applications · CodeHired</title>

      <header className={styles.header}>
        <div>
          <h1>Applications</h1>
          {status === 'ready' && (
            <p className={styles.count}>
              {applications.length === 1 ? '1 application' : `${applications.length} applications`}
              {due > 0 && <> · <strong className={styles.dueCount}>{due === 1 ? '1 follow-up due' : `${due} follow-ups due`}</strong></>}
            </p>
          )}
        </div>
        {status === 'ready' && (
          <div className={styles.headerActions}>
            {applications.length > 0 && (
              <button type='button' className='button button-secondary' onClick={() => downloadCsv(applications, today)}>
                Export CSV
              </button>
            )}
            {!adding && (
              <button type='button' className='button button-primary' onClick={() => setAdding(true)}>Add application</button>
            )}
          </div>
        )}
      </header>

      {adding && (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Add an application</h2>
          <p className={styles.panelLead}>For a job you found somewhere else. Jobs on CodeHired are tracked from their page.</p>
          <ApplicationForm submitLabel='Add application' onSubmit={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loading && <div className={styles.skeleton} aria-busy='true' aria-label='Loading applications' />}

      {status === 'error' && (
        <div className={styles.state} role='alert'>
          <p className={styles.stateTitle}>Couldn't load your applications</p>
          <p>{error.message}</p>
          <button type='button' className='button button-primary' onClick={load}>Try again</button>
        </div>
      )}

      {status === 'ready' && applications.length === 0 && !adding && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>No applications yet</p>
          <p>
            After you apply to a job from its page, CodeHired asks whether you applied and keeps it here.
            Applied somewhere else? Add it by hand.
          </p>
          <Link to='/search' className='button button-secondary'>Browse jobs</Link>
        </div>
      )}

      {status === 'ready' && groups.map((group) => (
        <section key={group.status} className={styles.group} aria-labelledby={`status-${group.status}`}>
          <h2 id={`status-${group.status}`} className={styles.groupTitle}>
            {group.label} <span className={styles.groupCount}>{group.items.length}</span>
          </h2>
          <ul className={styles.cards}>
            {group.items.map((application) => (
              <li key={application.id}>
                <ApplicationCard application={application} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

function ApplicationCard ({ application, today }) {
  const update = useApplicationsStore((state) => state.update)
  const remove = useApplicationsStore((state) => state.remove)
  const statusId = useId()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null)
  const due = isFollowUpDue(application, today)

  const run = async (action, message) => {
    setBusy(true)
    setFailed(null)
    try {
      await action()
    } catch (error) {
      if (error.status !== 401) setFailed(error.status === 404 ? 'This application was removed.' : message)
    } finally {
      setBusy(false)
    }
  }

  const handleStatus = (event) => run(() => update(application.id, { status: event.target.value }), "Couldn't change the status. Try again.")

  const handleDelete = () => {
    if (!window.confirm(`Stop tracking ${application.title} at ${application.company}? Its notes are deleted too.`)) return
    run(() => remove(application.id), "Couldn't remove it. Try again.")
  }

  const handleEdit = async (body) => {
    await update(application.id, body)
    setEditing(false)
  }

  if (editing) {
    return (
      <article className={`${styles.card} ${styles.editing}`}>
        <h3 className={styles.editTitle}>Edit {application.title}</h3>
        <ApplicationForm application={application} submitLabel='Save changes' onSubmit={handleEdit} onCancel={() => setEditing(false)} />
      </article>
    )
  }

  return (
    <article className={`${styles.card} ${due ? styles.due : ''}`} aria-busy={busy}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeading}>
          <h3 className={styles.title}>
            {/* A CodeHired job opens its page here; a manual entry its own link, if it has one */}
            {application.jobId
              ? <Link to={`/jobs/${encodeURIComponent(application.jobId)}`}>{application.title}</Link>
              : application.url
                ? <a href={application.url} target='_blank' rel='noopener noreferrer'>{application.title} ↗</a>
                : application.title}
          </h3>
          <p className={styles.company}>{application.company}</p>
        </div>
        <span className={`tag ${application.jobId ? 'tag-brand' : ''}`}>{application.jobId ? 'CodeHired' : 'Added by you'}</span>
      </div>

      <dl className={styles.facts}>
        {application.appliedAt && (
          <div>
            <dt>Applied</dt>
            <dd><time dateTime={application.appliedAt}>{formatCalendarDate(application.appliedAt)}</time></dd>
          </div>
        )}
        {application.followUpAt && (
          <div className={due ? styles.dueFact : undefined}>
            <dt>{due ? 'Follow up due' : 'Follow up'}</dt>
            <dd><time dateTime={application.followUpAt}>{formatCalendarDate(application.followUpAt)}</time></dd>
          </div>
        )}
        {application.source && (
          <div>
            <dt>Where</dt>
            <dd>
              {application.url && application.jobId
                ? <a href={application.url} target='_blank' rel='noopener noreferrer'>{application.source} ↗</a>
                : application.source}
            </dd>
          </div>
        )}
        {application.open === false && (
          <div>
            <dt>Posting</dt>
            <dd>No longer open</dd>
          </div>
        )}
      </dl>

      {application.notes && <p className={styles.notes}>{application.notes}</p>}

      <div className={styles.cardActions}>
        <label htmlFor={statusId} className='visually-hidden'>Status of {application.title}</label>
        <select id={statusId} className={`select ${styles.status}`} value={application.status} onChange={handleStatus} disabled={busy}>
          {APPLICATION_STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type='button' className={styles.textButton} onClick={() => setEditing(true)} disabled={busy}>
          Edit<span className='visually-hidden'> {application.title}</span>
        </button>
        <button type='button' className={`${styles.textButton} ${styles.danger}`} onClick={handleDelete} disabled={busy}>
          Remove<span className='visually-hidden'> {application.title}</span>
        </button>
      </div>

      {failed && <p role='alert' className={styles.error}>{failed}</p>}
    </article>
  )
}
