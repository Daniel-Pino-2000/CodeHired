import { create } from 'zustand'
import { deleteJson, getJson, patchJson, postJson } from '../services/api.js'
import { applicationPath, applicationsByJob, removeApplication, upsertApplication } from '../utils/applications.js'
import { useAuthStore } from './authStore.js'

// Bumped by every load and reset, so an answer meant for an earlier session (a slow request from
// before logging out, say) never lands in the current one
let generation = 0

// The signed-in user's applications, shared by /applications and the "Did you apply?" prompt on
// job pages, so they always agree. App.jsx loads it when someone signs in and resets it when they
// sign out. Changes wait for the API (creating one needs its id), then update the list.
export const useApplicationsStore = create((set, get) => {
  // Runs a request for the current session and applies its answer, unless the session changed
  async function send (request, apply) {
    const current = generation
    try {
      const result = await request()
      if (current === generation) set(apply(get().applications, result))
      return result
    } catch (error) {
      // The session expired: show the signed-out state (App.jsx then resets this store)
      if (error.status === 401 && current === generation) useAuthStore.setState({ user: null, status: 'ready' })
      throw error
    }
  }

  const withList = (applications) => ({ applications, byJob: applicationsByJob(applications) })

  return {
    // GET /me/applications: the most recently changed first
    applications: [],
    // The application that tracks each CodeHired job, by job id
    byJob: new Map(),
    // 'idle' (nobody signed in), 'loading', 'ready' or 'error' (`error` says why)
    status: 'idle',
    error: null,

    load: async () => {
      const current = ++generation
      set({ status: 'loading', error: null })
      try {
        const { data } = await getJson('/me/applications')
        if (current === generation) set({ ...withList(data), status: 'ready' })
      } catch (error) {
        if (current === generation) set({ status: 'error', error })
      }
    },

    reset: () => {
      generation++
      set({ ...withList([]), status: 'idle', error: null })
    },

    // POST /me/applications. Resolves to the new application. A 409 (the job was tracked in
    // another tab) reloads the list so the existing one shows, then rejects.
    add: async (body) => {
      try {
        return await send(() => postJson('/me/applications', body), (list, created) => withList(upsertApplication(list, created)))
      } catch (error) {
        if (error.status === 409) get().load()
        throw error
      }
    },

    // A 404 means it was removed elsewhere (another tab): drop it here too, then reject
    update: async (id, changes) => {
      try {
        return await send(() => patchJson(applicationPath(id), changes), (list, updated) => withList(upsertApplication(list, updated)))
      } catch (error) {
        if (error.status === 404) set(withList(removeApplication(get().applications, id)))
        throw error
      }
    },

    remove: (id) =>
      send(() => deleteJson(applicationPath(id)), (list) => withList(removeApplication(list, id)))
  }
})
