import { Link, NavLink, useLocation } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import { loginPath } from '../utils/auth.js'
import { UserMenu } from './UserMenu.jsx'
import styles from './Header.module.css'

export function Header () {
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const location = useLocation()
  const navClass = ({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`

  // "Sign in" brings you back to this page. From the login and register pages it keeps the
  // page you were heading to (`?next=`) instead.
  const onAuthPage = ['/login', '/register'].includes(location.pathname)
  const signInPath = onAuthPage ? `/login${location.search}` : loginPath(location)

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link to='/' className={styles.logo} aria-label='CodeHired home'>
          <span className={styles.logoMark} aria-hidden='true'>&lt;/&gt;</span>
          CodeHired
        </Link>

        <div className={styles.end}>
          <nav className={styles.nav} aria-label='Main'>
            <NavLink to='/' end className={navClass}>Home</NavLink>
            <NavLink to='/search' className={navClass}>Jobs</NavLink>
          </nav>

          {/* Nothing until GET /auth/me answers, so a signed-in user never sees "Sign in" flash */}
          {status === 'ready' && (user
            ? <UserMenu user={user} />
            : <Link to={signInPath} className={`button button-secondary ${styles.signIn}`}>Sign in</Link>)}
        </div>
      </div>
    </header>
  )
}
