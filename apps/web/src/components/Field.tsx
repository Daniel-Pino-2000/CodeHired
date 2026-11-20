import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import styles from './Field.module.css'

// A labelled input with its error message (and an optional hint) linked for screen readers
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field ({ label, error, hint, ...inputProps }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input
        id={id}
        className='input'
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={message ? messageId : undefined}
        {...inputProps}
      />
      {message && (
        <p id={messageId} className={error ? styles.error : styles.hint}>{message}</p>
      )}
    </div>
  )
}
