import type { Profile } from '@codehired/shared/api'
import { create } from 'zustand'
import { asError, errorStatus, getJson, putJson } from '../services/api.ts'
import type { ProfileBody } from '../utils/profile.ts'
import { signOutLocally } from './authStore.ts'
import type { LoadStatus } from './types.ts'

const PROFILE_PATH = '/me/profile'

// Bumped by every load and reset, so an answer meant for an earlier session never lands in the
// current one
let generation = 0

interface ProfileState {
  // GET /me/profile; `updatedAt` is null until the first save
  profile: Profile | null
  status: LoadStatus
  error: Error | null
  load: () => Promise<void>
  reset: () => void
  save: (body: ProfileBody) => Promise<Profile>
}

// The signed-in user's profile, shared by /profile and "Jobs for you" on the home page. App.tsx
// loads it when someone signs in and resets it when they sign out.
export const useProfileStore = create<ProfileState>()((set) => ({
  profile: null,
  status: 'idle',
  error: null,

  load: async () => {
    const current = ++generation
    set({ status: 'loading', error: null })
    try {
      const profile = await getJson<Profile>(PROFILE_PATH)
      if (current === generation) set({ profile, status: 'ready' })
    } catch (error) {
      if (current === generation) set({ status: 'error', error: asError(error) })
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
      const profile = await putJson<Profile>(PROFILE_PATH, body)
      if (current === generation) set({ profile, status: 'ready', error: null })
      return profile
    } catch (error) {
      // The session expired: show the signed-out state (App.tsx then resets this store)
      if (errorStatus(error) === 401 && current === generation) signOutLocally()
      throw error
    }
  }
}))
