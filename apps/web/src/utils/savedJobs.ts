// Pure helpers for the saved-jobs list the favorites store keeps. The list is ordered like
// GET /me/saved-jobs: the most recently saved first.
import type { Job, JobDetail, SavedJob } from '@codehired/shared/api'

// A job from a list or the detail page, shaped like an item of GET /me/saved-jobs. The detail
// page's extra fields are dropped so the store keeps no full descriptions in HTML.
export function toSavedJob (job: Job | JobDetail | SavedJob, savedAt: string): SavedJob {
  const { descriptionHtml: _html, alsoPostedOn: _alsoPostedOn, ...saved } = job as Partial<JobDetail> & Job
  return { ...saved, savedAt, open: 'open' in job ? job.open : true }
}

export function removeSaved<T extends { id: string }> (jobs: T[], id: string) {
  return jobs.filter((job) => job.id !== id)
}

// Inserts the job (replacing an older copy) where its save date puts it
export function addSaved<T extends { id: string, savedAt: string }> (jobs: T[], savedJob: T) {
  const others = removeSaved(jobs, savedJob.id)
  const index = others.findIndex((job) => job.savedAt <= savedJob.savedAt)
  return index === -1 ? [...others, savedJob] : others.toSpliced(index, 0, savedJob)
}

export const savedIds = (jobs: { id: string }[]) => new Set(jobs.map((job) => job.id))

export const savedJobPath = (id: string) => `/me/saved-jobs/${encodeURIComponent(id)}`
