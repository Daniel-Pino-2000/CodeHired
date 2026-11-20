import type { AuthResponse, User } from '@codehired/shared/api'
import { create } from 'zustand'
import { getJson, postJson } from '../services/api.ts'

export interface Credentials {
  email: string
  password: string
}

export interface Registration extends Credentials {
  name: string
}

interface AuthState {
  user: User | null
  // 'loading' until GET /auth/me has answered once
  status: 'loading' | 'ready'
  fetchMe: () => Promise<void>
  login: (credentials: Credentials) => Promise<User>
  register: (registration: Registration) => Promise<User>
  logout: () => Promise<void>
}

// The signed-in user. The session itself is an httpOnly cookie the browser sends on its own; this
// store only remembers who it belongs to. `status` is 'loading' until GET /auth/me has answered
// once, so protected pages wait instead of sending a signed-in user to the login page on refresh.
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'loading',

  fetchMe: async () => {
    let user: User | null = null
    try {
      ;({ user } = await getJson<AuthResponse>('/auth/me'))
    } catch {
      // 401 (no or expired session) or the API is down: either way nobody is signed in
    }
    // A login or register that finished first wins over this older answer
    if (get().status === 'loading') set({ user, status: 'ready' })
  },

  login: async ({ email, password }) => {
    const { user } = await postJson<AuthResponse>('/auth/login', { email, password })
    set({ user, status: 'ready' })
    return user
  },

  register: async ({ name, email, password }) => {
    const { user } = await postJson<AuthResponse>('/auth/register', { name, email, password })
    set({ user, status: 'ready' })
    return user
  },

  logout: async () => {
    try {
      await postJson<null>('/auth/logout')
    } finally {
      set({ user: null, status: 'ready' })
    }
  }
}))

// Shows the signed-out state after a 401 (the session expired). App.tsx then resets the stores
// that belong to the user.
export const signOutLocally = () => useAuthStore.setState({ user: null, status: 'ready' })
