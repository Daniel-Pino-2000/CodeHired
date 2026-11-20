import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { useApplicationsStore } from './store/applicationsStore.js'
import { useAuthStore } from './store/authStore.js'
import { useFavoritesStore } from './store/favoritesStore.js'
import { useProfileStore } from './store/profileStore.js'
import HomePage from './pages/Home.jsx'
import SearchPage from './pages/Search.jsx'
import JobDetailPage from './pages/JobDetail.jsx'
import CompanyPage from './pages/Company.jsx'
import SourcesPage from './pages/Sources.jsx'
import LoginPage from './pages/Login.jsx'
import RegisterPage from './pages/Register.jsx'
import AccountPage from './pages/Account.jsx'
import SavedPage from './pages/Saved.jsx'
import ApplicationsPage from './pages/Applications.jsx'
import ProfilePage from './pages/Profile.jsx'
import NotFoundPage from './pages/NotFound.jsx'

export default function App () {
  const fetchMe = useAuthStore((state) => state.fetchMe)
  const userId = useAuthStore((state) => state.user?.id)
  const loadFavorites = useFavoritesStore((state) => state.load)
  const resetFavorites = useFavoritesStore((state) => state.reset)
  const loadApplications = useApplicationsStore((state) => state.load)
  const resetApplications = useApplicationsStore((state) => state.reset)
  const loadProfile = useProfileStore((state) => state.load)
  const resetProfile = useProfileStore((state) => state.reset)

  // Restores the session on page load: the cookie survives a refresh, the store doesn't
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  // Saved jobs, applications and the profile belong to whoever is signed in: load them on sign-in, forget
  // them on sign-out
  useEffect(() => {
    if (userId) {
      loadFavorites()
      loadApplications()
      loadProfile()
    } else {
      resetFavorites()
      resetApplications()
      resetProfile()
    }
  }, [userId, loadFavorites, resetFavorites, loadApplications, resetApplications, loadProfile, resetProfile])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path='search' element={<SearchPage />} />
        <Route path='jobs/:id' element={<JobDetailPage />} />
        <Route path='companies/:slug' element={<CompanyPage />} />
        <Route path='sources' element={<SourcesPage />} />
        <Route path='login' element={<LoginPage />} />
        <Route path='register' element={<RegisterPage />} />

        {/* Pages that need an account */}
        <Route element={<ProtectedRoute />}>
          <Route path='account' element={<AccountPage />} />
          <Route path='saved' element={<SavedPage />} />
          <Route path='applications' element={<ApplicationsPage />} />
          <Route path='profile' element={<ProfilePage />} />
        </Route>

        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
