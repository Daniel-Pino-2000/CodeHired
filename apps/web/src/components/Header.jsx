import { Link, NavLink } from 'react-router'
import styles from './Header.module.css'

export function Header () {
  const navClass = ({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link to='/' className={styles.logo} aria-label='CodeHired home'>
          <span className={styles.logoMark} aria-hidden='true'>&lt;/&gt;</span>
          CodeHired
        </Link>

        <nav className={styles.nav} aria-label='Main'>
          <NavLink to='/' end className={navClass}>Home</NavLink>
          <NavLink to='/search' className={navClass}>Jobs</NavLink>
        </nav>
      </div>
    </header>
  )
}
