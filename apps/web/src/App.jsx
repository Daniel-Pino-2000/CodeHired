import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.jsx'
import HomePage from './pages/Home.jsx'
import SearchPage from './pages/Search.jsx'
import JobDetailPage from './pages/JobDetail.jsx'
import CompanyPage from './pages/Company.jsx'
import SourcesPage from './pages/Sources.jsx'
import NotFoundPage from './pages/NotFound.jsx'

export default function App () {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path='search' element={<SearchPage />} />
        <Route path='jobs/:id' element={<JobDetailPage />} />
        <Route path='companies/:slug' element={<CompanyPage />} />
        <Route path='sources' element={<SourcesPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
