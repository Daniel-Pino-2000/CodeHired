import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.jsx'
import HomePage from './pages/Home.jsx'
import SearchPage from './pages/Search.jsx'
import JobDetailPage from './pages/JobDetail.jsx'
import NotFoundPage from './pages/NotFound.jsx'

export default function App () {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path='search' element={<SearchPage />} />
        <Route path='jobs/:id' element={<JobDetailPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
