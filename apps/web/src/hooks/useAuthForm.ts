import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ApiError } from '../services/api.ts'
import { apiFieldErrors } from '../utils/auth.ts'

type Errors<Values> = Partial<Record<keyof Values & string, string>>

function formErrorMessage (error: unknown) {
  if (!(error instanceof ApiError)) return "Couldn't reach CodeHired. Check your connection and try again."
  // A 400 names the wrong fields next to them
  if (error.status === 400 && Object.keys(error.details).length) return null
  return error.message
}

interface AuthFormOptions<Values extends Record<string, string>> {
  initialValues: Values
  validate: (values: Values) => Errors<Values>
  submit: (values: Values) => Promise<unknown>
}

// State for the login and register forms: values, client-side checks, then the API's answer.
// The first field with a problem gets the focus, so keyboard and screen-reader users land on it.
export function useAuthForm<Values extends Record<string, string>> ({ initialValues, validate, submit }: AuthFormOptions<Values>) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Errors<Values>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const focusFirstError = (form: HTMLFormElement, found: Errors<Values>) => {
    const first = Object.keys(initialValues).find((name) => found[name as keyof Errors<Values>])
    if (!first) return
    const field = form.elements.namedItem(first)
    if (field instanceof HTMLElement) field.focus()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const found = validate(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) return focusFirstError(form, found)

    setSubmitting(true)
    try {
      // On success the page redirects, so there is nothing left to reset
      await submit(values)
    } catch (error) {
      const fieldErrors = apiFieldErrors(error) as Errors<Values>
      setErrors(fieldErrors)
      setFormError(formErrorMessage(error))
      setSubmitting(false)
      focusFirstError(form, fieldErrors)
    }
  }

  return { values, errors, formError, submitting, handleChange, handleSubmit }
}
