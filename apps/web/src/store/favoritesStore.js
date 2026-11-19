import { create } from 'zustand'
import { deleteJson, getJson, putJson } from '../services/api.js'
import { addSaved, removeSaved, savedIds, savedJobPath, toSavedJob } from '../utils/savedJobs.js'
import { useAuthStore } from './authStore.js'

// The same format as the API's dates (no milliseconds), so save dates compare as strings
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

// Bumped by every load and reset, so an answer meant for an earlier session (a slow request from
// before logging out, say) never lands in the current one
let generation = 0

// The signed-in user's saved jobs, shared by every bookmark button, the detail page and /saved,
// so they always agree. App.jsx loads it when someone signs in and resets it when they sign out.
// Saving and removing are optimistic: the change shows at once and is undone if the API fails.
export const useFavoritesStore = create((set, get) => ({
  // GET /me/saved-jobs: the most recently saved first
  jobs: [],
  // Their ids, for the bookmark buttons
  ids: new Set(),
  // 'idle' (nobody signed in), 'loading', 'ready' or 'error' (`error` says why)
  status: 'idle',
  error: null,
  // Ids of the jobs with a save or remove in flight: another click on them waits for it
  pending: new Set(),

  load: async () => {
    const current = ++generation
    set({ status: 'loading', error: null })
    try {
      const { data } = await getJson('/me/saved-jobs')
      if (current === generation) set({ jobs: data, ids: savedIds(data), status: 'ready' })
    } catch (error) {
      if (current === generation) set({ status: 'error', error })
    }
  },

  reset: () => {
    generation++
    set({ jobs: [], ids: new Set(), status: 'idle', error: null, pending: new Set() })
  },

  // Saves the job, or removes it when it is saved. Rejects when the API fails, after undoing.
  toggle: async (job) => {
    const { ids, pending, status, jobs } = get()
    if (status !== 'ready' || pending.has(job.id)) return

    const current = generation
    const saving = !ids.has(job.id)
    // What to put back if removing fails
    const removed = jobs.find((saved) => saved.id === job.id)

    const update = (nextJobs, nextPending) => set({ jobs: nextJobs, ids: savedIds(nextJobs), pending: nextPending })
    update(
      saving ? addSaved(jobs, toSavedJob(job, nowIso())) : removeSaved(jobs, job.id),
      new Set(pending).add(job.id)
    )

    const settle = (undo) => {
      if (current !== generation) return
      const state = get()
      const nextPending = new Set(state.pending)
      nextPending.delete(job.id)
      update(undo ? (saving ? removeSaved(state.jobs, job.id) : addSaved(state.jobs, removed)) : state.jobs, nextPending)
    }

    try {
      await (saving ? putJson(savedJobPath(job.id)) : deleteJson(savedJobPath(job.id)))
      settle(false)
    } catch (error) {
      settle(true)
      // The session expired: show the signed-out state (App.jsx then resets this store)
      if (error.status === 401) useAuthStore.setState({ user: null, status: 'ready' })
      throw error
    }
  }
}))
