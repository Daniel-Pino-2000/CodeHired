import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import { loginPath } from '../utils/auth.js'

// Wraps the routes that need an account. Signed out, it sends you to `/login?next=<this page>`,
// and the login page brings you back here afterwards.
export function ProtectedRoute () {
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  // Wait for GET /auth/me, or a refresh would bounce a signed-in user to the login page
  if (status === 'loading') {
    return <div className='container' aria-busy='true' aria-label='Checking your session' style={{ minHeight: '40vh' }} />
  }

  if (!user) return <Navigate to={loginPath(location)} replace />

  return <Outlet />
}
