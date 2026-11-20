import { Link, useNavigate } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import { formatDate } from '../utils/format.js'
import styles from './Account.module.css'

// The signed-in user's account. Behind ProtectedRoute, so `user` is always set here.
// Links to the profile, the saved jobs and the applications.
export default function AccountPage () {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    navigate('/')
    await logout()
  }

  return (
    <section className={`container ${styles.page}`}>
      <title>Account · CodeHired</title>

      <h1>Your account</h1>

      <dl className={styles.details}>
        <div>
          <dt>Name</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd><time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time></dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Link to='/profile' className='button button-secondary'>Profile</Link>
        <Link to='/saved' className='button button-secondary'>Saved jobs</Link>
        <Link to='/applications' className='button button-secondary'>Applications</Link>
        <button type='button' className='button button-secondary' onClick={handleLogout}>Log out</button>
      </div>
    </section>
  )
}
