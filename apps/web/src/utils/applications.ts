// Pure helpers for the applications the applications store keeps. The list is ordered like
// GET /me/applications: the most recently changed first. Only type imports (Node drops them), so
// `node --test` runs them.
import type { Application, ApplicationStatus } from '@codehired/shared/api'

// Typed by status, so a status the API adds and this misses is a compile error
const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
}

// /me/applications `status`, in the order an application moves through them
export const APPLICATION_STATUSES = (Object.keys(STATUS_LABELS) as ApplicationStatus[])
  .map((value) => ({ value, label: STATUS_LABELS[value] }))

export const statusLabel = (status: ApplicationStatus) => STATUS_LABELS[status] ?? status

// Still going somewhere: a follow-up date on these is a reminder. Rejected and withdrawn ones are done.
const ACTIVE = new Set<ApplicationStatus>(['saved', 'applied', 'interviewing', 'offer'])

const pad = (number: number) => String(number).padStart(2, '0')

// The candidate's own calendar date, YYYY-MM-DD: what a date input shows and the API stores
export const localToday = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// The fields the helpers below read, so tests can pass only those
type ApplicationFields = Pick<Application, 'status' | 'followUpAt'>

// A follow-up that is today or overdue, on an application that is still active
export const isFollowUpDue = ({ followUpAt, status }: ApplicationFields, today: string) =>
  Boolean(followUpAt && followUpAt <= today) && ACTIVE.has(status)

export interface StatusGroup<T> {
  status: ApplicationStatus
  label: string
  items: T[]
}

// One group per status that has applications, in the statuses' order. Within a group, follow-ups
// that are due come first, then the list's own order.
export function groupByStatus<T extends ApplicationFields> (applications: T[], today: string): StatusGroup<T>[] {
  return APPLICATION_STATUSES
    .map(({ value, label }) => {
      const items = applications.filter((application) => application.status === value)
      return {
        status: value,
        label,
        items: [
          ...items.filter((application) => isFollowUpDue(application, today)),
          ...items.filter((application) => !isFollowUpDue(application, today))
        ]
      }
    })
    .filter((group) => group.items.length > 0)
}

// Puts the application first (it was just created or changed), replacing an older copy
export const upsertApplication = <T extends { id: number }>(applications: T[], application: T) =>
  [application, ...applications.filter((other) => other.id !== application.id)]

export const removeApplication = <T extends { id: number }>(applications: T[], id: number) =>
  applications.filter((application) => application.id !== id)

// The application that tracks each CodeHired job
export const applicationsByJob = <T extends Pick<Application, 'jobId'>>(applications: T[]) =>
  new Map(applications.flatMap((application) => (application.jobId ? [[application.jobId, application] as const] : [])))

export const applicationPath = (id: number) => `/me/applications/${encodeURIComponent(id)}`

// The columns of the CSV export, and the field each one comes from
const CSV_COLUMNS: [string, keyof ApplicationFormValues][] = [
  ['Company', 'company'],
  ['Title', 'title'],
  ['Status', 'status'],
  ['Applied on', 'appliedAt'],
  ['Follow up on', 'followUpAt'],
  ['Where', 'source'],
  ['Link', 'url'],
  ['Notes', 'notes']
]

// Quotes a cell when it needs it, and keeps spreadsheets from running one that starts like a
// formula (`=HYPERLINK(...)` in a note would otherwise become a live link)
function csvCell (value: string | null | undefined) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// Every application as CSV, one row each with a header row, for a spreadsheet
export function toCsv (applications: Pick<Application, (typeof CSV_COLUMNS)[number][1]>[]) {
  return [
    CSV_COLUMNS.map(([header]) => header),
    ...applications.map((application) => CSV_COLUMNS.map(([, key]) => application[key]))
  ].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// The application form's fields, every one a string as inputs want
export interface ApplicationFormValues {
  company: string
  title: string
  url: string
  source: string
  status: ApplicationStatus
  appliedAt: string
  followUpAt: string
  notes: string
}

export type FieldErrors<Field extends string = string> = Partial<Record<Field, string>>

// The same rules as the API's schema (apps/api/src/schemas/application.ts), so most mistakes are
// caught before a request. `values` are the form's strings.
export function validateApplication ({ company, title, url }: Pick<ApplicationFormValues, 'company' | 'title' | 'url'>) {
  const errors: FieldErrors<keyof ApplicationFormValues> = {}
  if (!company.trim()) errors.company = 'Enter the company'
  if (!title.trim()) errors.title = 'Enter the job title'
  if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) errors.url = 'Enter a link that starts with https://'
  return errors
}

// The form's values for an application, or for a new one
export function toFormValues (application: Partial<Application> | null | undefined, today: string): ApplicationFormValues {
  return {
    company: application?.company ?? '',
    title: application?.title ?? '',
    url: application?.url ?? '',
    source: application?.source ?? '',
    status: application?.status ?? 'applied',
    appliedAt: application ? application.appliedAt ?? '' : today,
    followUpAt: application?.followUpAt ?? '',
    notes: application?.notes ?? ''
  }
}

// POST /me/applications and PATCH /me/applications/:id. Blank optional fields are sent as '',
// which the API stores as none. Tracking a CodeHired job sends its `jobId` instead of the
// company, title and link.
export interface ApplicationBody {
  jobId?: string
  company?: string
  title?: string
  url?: string
  source?: string
  status?: ApplicationStatus
  notes?: string
  appliedAt?: string
  followUpAt?: string
}

// What to send for the form
export function toRequestBody (values: ApplicationFormValues): ApplicationBody {
  return {
    ...values,
    company: values.company.trim(),
    title: values.title.trim(),
    url: values.url.trim(),
    source: values.source.trim(),
    notes: values.notes.trim()
  }
}
