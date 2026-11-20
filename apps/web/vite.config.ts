import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app calls the API under its own origin (`/api/jobs`), so the session cookie is a
// first-party cookie. In development Vite forwards `/api/*` to the API without the prefix; in
// production the hosting's `/api` rewrite does the same (#21).
const apiProxy = {
  '/api': {
    target: 'http://localhost:3000',
    rewrite: (path: string) => path.replace(/^\/api/, '')
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy
  },
  preview: {
    proxy: apiProxy
  }
})
