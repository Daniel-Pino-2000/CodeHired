import { create } from 'zustand'
import { getJson, putJson } from '../services/api.js'
import { useAuthStore } from './authStore.js'

const PROFILE_PATH = '/me/profile'

// Bumped by every load and reset, so an answer meant for an earlier session never lands in the
// current one
let generation = 0

// The signed-in user's profile, shared by /profile and "Jobs for you" on the home page. App.jsx
// loads it when someone signs in and resets it when they sign out.
export const useProfileStore = create((set) => ({
  // GET /me/profile; `updatedAt` is null until the first save
  profile: null,
  // 'idle' (nobody signed in), 'loading', 'ready' or 'error' (`error` says why)
  status: 'idle',
  error: null,

  load: async () => {
    const current = ++generation
    set({ status: 'loading', error: null })
    try {
      const profile = await getJson(PROFILE_PATH)
      if (current === generation) set({ profile, status: 'ready' })
    } catch (error) {
      if (current === generation) set({ status: 'error', error })
    }
  },

  reset: () => {
    generation++
    set({ profile: null, status: 'idle', error: null })
  },

  // PUT /me/profile with the whole profile. Resolves to the saved one.
  save: async (body) => {
    const current = generation
    try {
      const profile = await putJson(PROFILE_PATH, body)
      if (current === generation) set({ profile, status: 'ready', error: null })
      return profile
    } catch (error) {
      // The session expired: show the signed-out state (App.jsx then resets this store)
      if (error.status === 401 && current === generation) useAuthStore.setState({ user: null, status: 'ready' })
      throw error
    }
  }
}))
