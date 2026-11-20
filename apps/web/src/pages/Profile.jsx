import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Field } from '../components/Field.jsx'
import fieldStyles from '../components/Field.module.css'
import { SkillsInput } from '../components/SkillsInput.jsx'
import { LEVELS, WORKPLACES } from '../config.js'
import { useAuthStore } from '../store/authStore.js'
import { useProfileStore } from '../store/profileStore.js'
import { apiFieldErrors } from '../utils/auth.js'
import { levelLabel, technologyLabel, workplaceLabel } from '../utils/format.js'
import {
  experienceLabel,
  jobsForYouFilters,
  jobsForYouPath,
  PROFILE_LIMITS,
  profileLinks,
  toFormValues,
  toRequestBody,
  validateProfile
} from '../utils/profile.js'
import styles from './Profile.module.css'

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

// A labelled <select> whose first option means "not set"
function SelectField ({ label, name, value, options, anyLabel, onChange }) {
  const id = useId()
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>{label}</label>
      <select id={id} name={name} className='select' value={value} onChange={onChange}>
        <option value=''>{anyLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

// How the profile reads, from what the form holds now. Links that aren't valid yet are left out,
// so nothing but a web link ever becomes an href.
function ProfilePreview ({ name, values, errors }) {
  const draft = toRequestBody(values)
  const years = Number.isInteger(draft.yearsOfExperience) && !errors.yearsOfExperience ? draft.yearsOfExperience : null
  const links = profileLinks({
    links: {
      github: errors['links.github'] ? null : draft.links.github,
      linkedin: errors['links.linkedin'] ? null : draft.links.linkedin,
      portfolio: errors['links.portfolio'] ? null : draft.links.portfolio
    },
    resumeUrl: errors.resumeUrl ? null : draft.resumeUrl
  })
  const facts = [draft.location, experienceLabel(years)].filter(Boolean)
  const lookingFor = [draft.desiredLevel && levelLabel(draft.desiredLevel), draft.desiredWorkplace && workplaceLabel(draft.desiredWorkplace)].filter(Boolean)
  const isEmpty = !draft.headline && facts.length === 0 && !draft.bio && draft.skills.length === 0 && lookingFor.length === 0 && links.length === 0

  return (
    <article className={styles.preview} aria-labelledby='profile-preview-title'>
      <p className={styles.previewLabel} id='profile-preview-title'>Preview</p>

      <header className={styles.who}>
        <span className={styles.avatar} aria-hidden='true'>{initials(name) || '?'}</span>
        <div>
          <h2 className={styles.name}>{name}</h2>
          {draft.headline && <p className={styles.headline}>{draft.headline}</p>}
        </div>
      </header>

      {facts.length > 0 && <p className={styles.facts}>{facts.join(' · ')}</p>}
      {draft.bio && <p className={styles.about}>{draft.bio}</p>}

      {draft.skills.length > 0 && (
        <ul className={styles.tags} aria-label='Skills'>
          {draft.skills.map((slug) => <li key={slug} className='tag tag-brand'>{technologyLabel(slug)}</li>)}
        </ul>
      )}

      {lookingFor.length > 0 && (
        <p className={styles.lookingFor}>
          <span>Looking for</span>
          {lookingFor.map((label) => <span key={label} className='tag'>{label}</span>)}
        </p>
      )}

      {links.length > 0 && (
        <ul className={styles.links}>
          {links.map(({ label, url }) => (
            <li key={label}><a href={url} target='_blank' rel='noopener noreferrer'>{label} ↗</a></li>
          ))}
        </ul>
      )}

      {isEmpty && <p className={styles.empty}>Fill in the form and your profile shows up here.</p>}
    </article>
  )
}

function ProfileForm ({ profile, name }) {
  const id = useId()
  const save = useProfileStore((state) => state.save)
  const [values, setValues] = useState(() => toFormValues(profile))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(null)

  const setValue = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
    setSaved(null)
  }
  const handleChange = (event) => setValue(event.target.name, event.target.value)

  // Only the problems with what is typed now: the preview leaves out links that aren't valid yet
  const liveErrors = validateProfile(values)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors(liveErrors)
    setFormError(null)
    setSaved(null)
    if (Object.keys(liveErrors).length > 0) return

    setSubmitting(true)
    try {
      const profile = await save(toRequestBody(values))
      setValues(toFormValues(profile))
      setSaved(profile)
    } catch (error) {
      const fieldErrors = apiFieldErrors(error)
      setErrors(fieldErrors)
      // A signed-out user is sent to the login page: nothing to show here
      if (error.status !== 401 && Object.keys(fieldErrors).length === 0) setFormError("Couldn't save your profile. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const fieldProps = (field) => ({ name: field, value: values[field], onChange: handleChange, error: errors[field] })

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && <p role='alert' className={styles.formError}>{formError}</p>}

        <fieldset className={styles.section}>
          <legend>About you</legend>
          <Field label='Headline' placeholder='Frontend developer who loves accessible UIs' maxLength={PROFILE_LIMITS.headline} {...fieldProps('headline')} />
          <div className={styles.grid}>
            <Field label='Location' placeholder='Austin, TX' maxLength={PROFILE_LIMITS.location} autoComplete='address-level2' {...fieldProps('location')} />
            <Field label='Years of experience' type='number' inputMode='numeric' min={0} max={PROFILE_LIMITS.yearsOfExperience} step={1} {...fieldProps('yearsOfExperience')} />
          </div>
          <div className={fieldStyles.field}>
            <label htmlFor={`${id}-bio`} className={fieldStyles.label}>About</label>
            <textarea
              id={`${id}-bio`}
              name='bio'
              className={`input ${styles.bio}`}
              rows={4}
              maxLength={PROFILE_LIMITS.bio}
              placeholder='What you build, what you want to work on next'
              value={values.bio}
              onChange={handleChange}
              aria-invalid={errors.bio ? 'true' : undefined}
            />
            {errors.bio && <p className={fieldStyles.error}>{errors.bio}</p>}
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Skills</legend>
          <SkillsInput
            label='Technologies you work with'
            value={values.skills}
            onChange={(skills) => setValue('skills', skills)}
            error={errors.skills}
            hint={`Up to ${PROFILE_LIMITS.skills}. "Jobs for you" shows jobs that use any of them.`}
          />
        </fieldset>

        <fieldset className={styles.section}>
          <legend>What you're looking for</legend>
          <div className={styles.grid}>
            <SelectField label='Level' name='desiredLevel' value={values.desiredLevel} options={LEVELS} anyLabel='Any level' onChange={handleChange} />
            <SelectField label='Workplace' name='desiredWorkplace' value={values.desiredWorkplace} options={WORKPLACES} anyLabel='Any workplace' onChange={handleChange} />
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Links and resume</legend>
          <div className={styles.grid}>
            <Field label='GitHub' type='url' inputMode='url' placeholder='https://github.com/you' maxLength={PROFILE_LIMITS.url} {...fieldProps('links.github')} />
            <Field label='LinkedIn' type='url' inputMode='url' placeholder='https://www.linkedin.com/in/you' maxLength={PROFILE_LIMITS.url} {...fieldProps('links.linkedin')} />
            <Field label='Portfolio' type='url' inputMode='url' placeholder='https://' maxLength={PROFILE_LIMITS.url} {...fieldProps('links.portfolio')} />
            <Field
              label='Resume'
              type='url'
              inputMode='url'
              placeholder='https://'
              maxLength={PROFILE_LIMITS.url}
              hint='A link anyone can open, like a shared Google Drive or Dropbox file'
              {...fieldProps('resumeUrl')}
            />
          </div>
        </fieldset>

        <div className={styles.actions}>
          <button type='submit' className='button button-primary' disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Saving…' : 'Save profile'}
          </button>
          <p className={styles.saved} aria-live='polite'>
            {saved && (
              <>
                Profile saved.{' '}
                {jobsForYouFilters(saved) && <Link to={jobsForYouPath(saved)}>See jobs for you →</Link>}
              </>
            )}
          </p>
        </div>
      </form>

      <ProfilePreview name={name} values={values} errors={liveErrors} />
    </div>
  )
}

// The signed-in user's candidate profile: a form, and a preview of how it reads. Behind
// ProtectedRoute, so `user` is always set here.
export default function ProfilePage () {
  const user = useAuthStore((state) => state.user)
  const profile = useProfileStore((state) => state.profile)
  const status = useProfileStore((state) => state.status)
  const load = useProfileStore((state) => state.load)

  return (
    <section className={`container ${styles.page}`}>
      <title>Your profile · CodeHired</title>

      <header className={styles.header}>
        <h1>Your profile</h1>
        <p className={styles.subtitle}>Your skills and what you're looking for pick the jobs on your home page.</p>
      </header>

      {/* The form starts from the saved profile, so it waits for it */}
      {(status === 'idle' || status === 'loading') && <div className={styles.loading} aria-busy='true' aria-label='Loading your profile' />}
      {status === 'error' && (
        <div role='alert' className={styles.loadError}>
          <p>Couldn't load your profile.</p>
          <button type='button' className='button button-primary' onClick={load}>Try again</button>
        </div>
      )}
      {status === 'ready' && profile && <ProfileForm profile={profile} name={user.name} />}
    </section>
  )
}
