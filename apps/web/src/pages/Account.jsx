import { useNavigate } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import { formatDate } from '../utils/format.js'
import styles from './Account.module.css'

// The signed-in user's account. Behind ProtectedRoute, so `user` is always set here.
// Saved jobs (#13), applications (#14) and the profile (#15) will link from this page.
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

      <button type='button' className='button button-secondary' onClick={handleLogout}>Log out</button>
    </section>
  )
}
