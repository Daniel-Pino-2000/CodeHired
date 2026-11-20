import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { User } from '@codehired/shared/api'
import { useAuthStore } from '../store/authStore.ts'
import styles from './UserMenu.module.css'

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

// The signed-in user's button in the header. It opens a small panel with their account and
// "Log out", and closes on Escape, on a click elsewhere or when you pick an item.
export function UserMenu ({ user }: { user: User }) {
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    // Leave first: on a protected page, signing out would otherwise send you to the login page
    navigate('/')
    await logout()
  }

  return (
    <div className={styles.menu} ref={rootRef}>
      <button
        ref={buttonRef}
        type='button'
        className={styles.trigger}
        aria-expanded={open}
        aria-controls='user-menu'
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.avatar} aria-hidden='true'>{initials(user.name) || '?'}</span>
        <span className={styles.name}>{user.name}</span>
        <span className='visually-hidden'>, account menu</span>
      </button>

      {open && (
        <div id='user-menu' className={styles.panel}>
          <p className={styles.who}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </p>
          <Link to='/profile' className={styles.item} onClick={() => setOpen(false)}>Profile</Link>
          <Link to='/saved' className={styles.item} onClick={() => setOpen(false)}>Saved jobs</Link>
          <Link to='/applications' className={styles.item} onClick={() => setOpen(false)}>Applications</Link>
          <Link to='/account' className={styles.item} onClick={() => setOpen(false)}>Account</Link>
          <button type='button' className={styles.item} onClick={handleLogout}>Log out</button>
        </div>
      )}
    </div>
  )
}
