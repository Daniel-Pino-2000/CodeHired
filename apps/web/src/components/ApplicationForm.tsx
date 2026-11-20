import { useId, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Application } from '@codehired/shared/api'
import { errorStatus } from '../services/api.ts'
import { APPLICATION_STATUSES, localToday, toFormValues, toRequestBody, validateApplication } from '../utils/applications.ts'
import type { ApplicationBody, ApplicationFormValues, FieldErrors } from '../utils/applications.ts'
import { apiFieldErrors } from '../utils/auth.ts'
import { Field } from './Field.tsx'
import fieldStyles from './Field.module.css'
import styles from './ApplicationForm.module.css'

interface ApplicationFormProps {
  application?: Application | null
  submitLabel: string
  onSubmit: (body: ApplicationBody) => Promise<unknown>
  onCancel: () => void
}

// Adds an application by hand, or edits one. `onSubmit` gets the request body and returns a
// promise; a 400's field errors show next to their fields.
export function ApplicationForm ({ application = null, submitLabel, onSubmit, onCancel }: ApplicationFormProps) {
  const id = useId()
  const [values, setValues] = useState(() => toFormValues(application, localToday()))
  const [errors, setErrors] = useState<FieldErrors<keyof ApplicationFormValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Every field is named after its value
    const name = event.target.name as keyof ApplicationFormValues
    const { value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validateApplication(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit(toRequestBody(values))
    } catch (error) {
      const fieldErrors = apiFieldErrors(error)
      setErrors(fieldErrors)
      // A signed-out user is sent to the login page: nothing to show here
      const status = errorStatus(error)
      if (status !== 401 && Object.keys(fieldErrors).length === 0) {
        setFormError(status === 404 ? 'This application was removed.' : "Couldn't save it. Try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError && <p role='alert' className={styles.formError}>{formError}</p>}

      <div className={styles.grid}>
        <Field label='Company' name='company' value={values.company} onChange={handleChange} error={errors.company} maxLength={200} required />
        <Field label='Job title' name='title' value={values.title} onChange={handleChange} error={errors.title} maxLength={200} required />
        <Field
          label='Link to the posting'
          name='url'
          type='url'
          inputMode='url'
          placeholder='https://'
          value={values.url}
          onChange={handleChange}
          error={errors.url}
          maxLength={2048}
        />
        <Field
          label='Where you applied'
          name='source'
          placeholder='LinkedIn, company site, referral…'
          value={values.source}
          onChange={handleChange}
          error={errors.source}
          maxLength={100}
        />

        <div className={fieldStyles.field}>
          <label htmlFor={`${id}-status`} className={fieldStyles.label}>Status</label>
          <select id={`${id}-status`} name='status' className='select' value={values.status} onChange={handleChange}>
            {APPLICATION_STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <Field label='Applied on' name='appliedAt' type='date' value={values.appliedAt} onChange={handleChange} error={errors.appliedAt} />
        <Field
          label='Follow up on'
          name='followUpAt'
          type='date'
          value={values.followUpAt}
          onChange={handleChange}
          error={errors.followUpAt}
          hint='A reminder: it is highlighted once the day comes'
        />
      </div>

      <div className={fieldStyles.field}>
        <label htmlFor={`${id}-notes`} className={fieldStyles.label}>Notes</label>
        <textarea
          id={`${id}-notes`}
          name='notes'
          className={`input ${styles.notes}`}
          rows={3}
          maxLength={5000}
          value={values.notes}
          onChange={handleChange}
          aria-invalid={errors.notes ? 'true' : undefined}
        />
        {errors.notes && <p className={fieldStyles.error}>{errors.notes}</p>}
      </div>

      <div className={styles.actions}>
        <button type='submit' className='button button-primary' disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type='button' className='button button-secondary' onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  )
}
