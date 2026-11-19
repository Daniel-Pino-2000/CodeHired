import { Link, Navigate, useSearchParams } from 'react-router'
import { Field } from '../components/Field.jsx'
import { useAuthForm } from '../hooks/useAuthForm.js'
import { useAuthStore } from '../store/authStore.js'
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, safeNext, validateRegister } from '../utils/auth.js'
import styles from './Auth.module.css'

export default function RegisterPage () {
  const user = useAuthStore((state) => state.user)
  const register = useAuthStore((state) => state.register)
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))

  const { values, errors, formError, submitting, handleChange, handleSubmit } = useAuthForm({
    initialValues: { name: '', email: '', password: '' },
    validate: validateRegister,
    submit: register
  })

  if (user) return <Navigate to={next} replace />

  const loginLink = searchParams.has('next') ? `/login?${new URLSearchParams({ next })}` : '/login'

  return (
    <section className={`container ${styles.page}`}>
      <title>Create an account · CodeHired</title>

      <div className={styles.card}>
        <h1>Create an account</h1>
        <p className={styles.lead}>Free. Save jobs and keep track of every application in one place.</p>

        {formError && <p role='alert' className={styles.formError}>{formError}</p>}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Field
            label='Name'
            name='name'
            autoComplete='name'
            maxLength={NAME_MAX}
            value={values.name}
            onChange={handleChange}
            error={errors.name}
          />
          <Field
            label='Email'
            name='email'
            type='email'
            autoComplete='email'
            value={values.email}
            onChange={handleChange}
            error={errors.email}
          />
          <Field
            label='Password'
            name='password'
            type='password'
            autoComplete='new-password'
            maxLength={PASSWORD_MAX}
            value={values.password}
            onChange={handleChange}
            error={errors.password}
            hint={`At least ${PASSWORD_MIN} characters`}
          />
          <button type='submit' className='button button-primary' disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.switch}>
          Already have an account? <Link to={loginLink}>Sign in</Link>
        </p>
      </div>
    </section>
  )
}
