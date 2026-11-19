import { create } from 'zustand'
import { postJson, getJson } from '../services/api.js'

// The signed-in user. The session itself is an httpOnly cookie the browser sends on its own; this
// store only remembers who it belongs to. `status` is 'loading' until GET /auth/me has answered
// once, so protected pages wait instead of sending a signed-in user to the login page on refresh.
export const useAuthStore = create((set, get) => ({
  user: null,
  status: 'loading',

  fetchMe: async () => {
    let user = null
    try {
      ;({ user } = await getJson('/auth/me'))
    } catch {
      // 401 (no or expired session) or the API is down: either way nobody is signed in
    }
    // A login or register that finished first wins over this older answer
    if (get().status === 'loading') set({ user, status: 'ready' })
  },

  login: async ({ email, password }) => {
    const { user } = await postJson('/auth/login', { email, password })
    set({ user, status: 'ready' })
    return user
  },

  register: async ({ name, email, password }) => {
    const { user } = await postJson('/auth/register', { name, email, password })
    set({ user, status: 'ready' })
    return user
  },

  logout: async () => {
    try {
      await postJson('/auth/logout')
    } finally {
      set({ user: null, status: 'ready' })
    }
  }
}))
