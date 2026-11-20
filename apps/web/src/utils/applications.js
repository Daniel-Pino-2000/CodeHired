// Pure helpers for the applications the applications store keeps. The list is ordered like
// GET /me/applications: the most recently changed first. No imports, so `node --test` runs them.

// /me/applications `status`, in the order an application moves through them
export const APPLICATION_STATUSES = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' }
]

export const statusLabel = (status) => APPLICATION_STATUSES.find((option) => option.value === status)?.label ?? status

// Still going somewhere: a follow-up date on these is a reminder. Rejected and withdrawn ones are done.
const ACTIVE = new Set(['saved', 'applied', 'interviewing', 'offer'])

const pad = (number) => String(number).padStart(2, '0')

// The candidate's own calendar date, YYYY-MM-DD: what a date input shows and the API stores
export const localToday = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// A follow-up that is today or overdue, on an application that is still active
export const isFollowUpDue = (application, today) =>
  Boolean(application.followUpAt) && application.followUpAt <= today && ACTIVE.has(application.status)

// One group per status that has applications, in the statuses' order. Within a group, follow-ups
// that are due come first, then the list's own order.
export function groupByStatus (applications, today) {
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
export const upsertApplication = (applications, application) =>
  [application, ...applications.filter((other) => other.id !== application.id)]

export const removeApplication = (applications, id) => applications.filter((application) => application.id !== id)

// The application that tracks each CodeHired job
export const applicationsByJob = (applications) =>
  new Map(applications.filter((application) => application.jobId).map((application) => [application.jobId, application]))

export const applicationPath = (id) => `/me/applications/${encodeURIComponent(id)}`

const CSV_COLUMNS = [
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
function csvCell (value) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// Every application as CSV, one row each with a header row, for a spreadsheet
export function toCsv (applications) {
  return [
    CSV_COLUMNS.map(([header]) => header),
    ...applications.map((application) => CSV_COLUMNS.map(([, key]) => application[key]))
  ].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// The same rules as the API's schema (apps/api/src/schemas/application.ts), so most mistakes are
// caught before a request. `values` are the form's strings.
export function validateApplication ({ company, title, url }) {
  const errors = {}
  if (!company.trim()) errors.company = 'Enter the company'
  if (!title.trim()) errors.title = 'Enter the job title'
  if (url.trim() && !/^https?:\/\/\S+$/i.test(url.trim())) errors.url = 'Enter a link that starts with https://'
  return errors
}

// The form's values for an application, or for a new one: every field a string, as inputs want
export function toFormValues (application, today) {
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

// What to send for the form: blank optional fields stay '', which the API stores as none
export function toRequestBody (values) {
  const body = { ...values }
  for (const key of ['company', 'title', 'url', 'source', 'notes']) body[key] = values[key].trim()
  return body
}
