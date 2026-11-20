import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { useApplicationsStore } from './store/applicationsStore.ts'
import { useAuthStore } from './store/authStore.ts'
import { useFavoritesStore } from './store/favoritesStore.ts'
import { useProfileStore } from './store/profileStore.ts'
import HomePage from './pages/Home.tsx'
import SearchPage from './pages/Search.tsx'
import JobDetailPage from './pages/JobDetail.tsx'
import CompanyPage from './pages/Company.tsx'
import SourcesPage from './pages/Sources.tsx'
import LoginPage from './pages/Login.tsx'
import RegisterPage from './pages/Register.tsx'
import AccountPage from './pages/Account.tsx'
import SavedPage from './pages/Saved.tsx'
import ApplicationsPage from './pages/Applications.tsx'
import ProfilePage from './pages/Profile.tsx'
import NotFoundPage from './pages/NotFound.tsx'

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
