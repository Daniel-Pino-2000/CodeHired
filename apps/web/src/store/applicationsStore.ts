import type { Application, ListResponse } from '@codehired/shared/api'
import { create } from 'zustand'
import { asError, deleteJson, errorStatus, getJson, patchJson, postJson } from '../services/api.ts'
import { applicationPath, applicationsByJob, removeApplication, upsertApplication } from '../utils/applications.ts'
import type { ApplicationBody } from '../utils/applications.ts'
import { signOutLocally } from './authStore.ts'
import type { LoadStatus } from './types.ts'

// Bumped by every load and reset, so an answer meant for an earlier session (a slow request from
// before logging out, say) never lands in the current one
let generation = 0

interface ApplicationsList {
  // GET /me/applications: the most recently changed first
  applications: Application[]
  // The application that tracks each CodeHired job, by job id
  byJob: Map<string, Application>
}

interface ApplicationsState extends ApplicationsList {
  status: LoadStatus
  error: Error | null
  load: () => Promise<void>
  reset: () => void
  add: (body: ApplicationBody) => Promise<Application>
  update: (id: number, changes: ApplicationBody) => Promise<Application>
  remove: (id: number) => Promise<null>
}

const withList = (applications: Application[]): ApplicationsList => ({ applications, byJob: applicationsByJob(applications) })

// The signed-in user's applications, shared by /applications and the "Did you apply?" prompt on
// job pages, so they always agree. App.tsx loads it when someone signs in and resets it when they
// sign out. Changes wait for the API (creating one needs its id), then update the list.
export const useApplicationsStore = create<ApplicationsState>()((set, get) => {
  // Runs a request for the current session and applies its answer, unless the session changed
  async function send<T> (request: () => Promise<T>, apply: (list: Application[], result: T) => ApplicationsList) {
    const current = generation
    try {
      const result = await request()
      if (current === generation) set(apply(get().applications, result))
      return result
    } catch (error) {
      // The session expired: show the signed-out state (App.tsx then resets this store)
      if (errorStatus(error) === 401 && current === generation) signOutLocally()
      throw error
    }
  }

  return {
    ...withList([]),
    status: 'idle',
    error: null,

    load: async () => {
      const current = ++generation
      set({ status: 'loading', error: null })
      try {
        const { data } = await getJson<ListResponse<Application>>('/me/applications')
        if (current === generation) set({ ...withList(data), status: 'ready' })
      } catch (error) {
        if (current === generation) set({ status: 'error', error: asError(error) })
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
        return await send(() => postJson<Application>('/me/applications', body), (list, created) => withList(upsertApplication(list, created)))
      } catch (error) {
        if (errorStatus(error) === 409) get().load()
        throw error
      }
    },

    // A 404 means it was removed elsewhere (another tab): drop it here too, then reject
    update: async (id, changes) => {
      try {
        return await send(() => patchJson<Application>(applicationPath(id), changes), (list, updated) => withList(upsertApplication(list, updated)))
      } catch (error) {
        if (errorStatus(error) === 404) set(withList(removeApplication(get().applications, id)))
        throw error
      }
    },

    remove: (id) =>
      send(() => deleteJson(applicationPath(id)), (list) => withList(removeApplication(list, id)))
  }
})
