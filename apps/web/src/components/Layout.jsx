import { Outlet } from 'react-router'
import { Header } from './Header.jsx'
import { Footer } from './Footer.jsx'

export function Layout () {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
