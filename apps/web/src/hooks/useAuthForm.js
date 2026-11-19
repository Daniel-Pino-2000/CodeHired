import { useState } from 'react'
import { ApiError } from '../services/api.js'
import { apiFieldErrors } from '../utils/auth.js'

function formErrorMessage (error) {
  if (!(error instanceof ApiError)) return "Couldn't reach CodeHired. Check your connection and try again."
  // A 400 names the wrong fields next to them
  if (error.status === 400 && Object.keys(error.details).length) return null
  return error.message
}

// State for the login and register forms: values, client-side checks, then the API's answer.
// The first field with a problem gets the focus, so keyboard and screen-reader users land on it.
export function useAuthForm ({ initialValues, validate, submit }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const focusFirstError = (form, found) => {
    const first = Object.keys(initialValues).find((name) => found[name])
    if (first) form.elements.namedItem(first)?.focus()
  }

  const handleSubmit = async (event) => {
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
      const fieldErrors = apiFieldErrors(error)
      setErrors(fieldErrors)
      setFormError(formErrorMessage(error))
      setSubmitting(false)
      focusFirstError(form, fieldErrors)
    }
  }

  return { values, errors, formError, submitting, handleChange, handleSubmit }
}
