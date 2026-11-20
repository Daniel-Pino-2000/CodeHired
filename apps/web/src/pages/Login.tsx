import { Link, Navigate, useSearchParams } from 'react-router'
import { Field } from '../components/Field.tsx'
import { useAuthForm } from '../hooks/useAuthForm.ts'
import { useAuthStore } from '../store/authStore.ts'
import { safeNext, validateLogin } from '../utils/auth.ts'
import styles from './Auth.module.css'

export default function LoginPage () {
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))

  const { values, errors, formError, submitting, handleChange, handleSubmit } = useAuthForm({
    initialValues: { email: '', password: '' },
    validate: validateLogin,
    submit: login
  })

  // Signed in (just now, or already): back to the page that asked for an account
  if (user) return <Navigate to={next} replace />

  const registerLink = searchParams.has('next') ? `/register?${new URLSearchParams({ next })}` : '/register'

  return (
    <section className={`container ${styles.page}`}>
      <title>Sign in · CodeHired</title>

      <div className={styles.card}>
        <h1>Sign in</h1>
        <p className={styles.lead}>Save jobs and keep track of your applications.</p>

        {formError && <p role='alert' className={styles.formError}>{formError}</p>}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
            autoComplete='current-password'
            value={values.password}
            onChange={handleChange}
            error={errors.password}
          />
          <button type='submit' className='button button-primary' disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.switch}>
          New to CodeHired? <Link to={registerLink}>Create an account</Link>
        </p>
      </div>
    </section>
  )
}
