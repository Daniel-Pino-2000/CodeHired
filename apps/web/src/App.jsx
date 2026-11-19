import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { useAuthStore } from './store/authStore.js'
import HomePage from './pages/Home.jsx'
import SearchPage from './pages/Search.jsx'
import JobDetailPage from './pages/JobDetail.jsx'
import CompanyPage from './pages/Company.jsx'
import SourcesPage from './pages/Sources.jsx'
import LoginPage from './pages/Login.jsx'
import RegisterPage from './pages/Register.jsx'
import AccountPage from './pages/Account.jsx'
import NotFoundPage from './pages/NotFound.jsx'

export default function App () {
  const fetchMe = useAuthStore((state) => state.fetchMe)

  // Restores the session on page load: the cookie survives a refresh, the store doesn't
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

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

        {/* Pages that need an account (#13 saved jobs, #14 applications, #15 profile go here) */}
        <Route element={<ProtectedRoute />}>
          <Route path='account' element={<AccountPage />} />
        </Route>

        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
