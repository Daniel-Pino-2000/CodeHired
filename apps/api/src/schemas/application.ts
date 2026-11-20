import { z } from 'zod'
import { APPLICATION_STATUSES } from '../types.js'

// Forms send '' for a field left blank: that clears it
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max)
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable())

// A calendar date the candidate picked, YYYY-MM-DD (a real one: no February 30)
const calendarDate = z.preprocess(emptyToNull, z.iso.date().nullable())

// Only web links: the page shows it as a link, so `javascript:` must never get in
const postingUrl = z.preprocess(emptyToNull, z.url({ protocol: /^https?$/, error: 'Enter a link that starts with https://' }).max(2048).nullable())

const status = z.enum(APPLICATION_STATUSES)
const notes = z.string().trim().max(5000)

// POST /me/applications. With `jobId`, the company, title, link and source are copied from that
// CodeHired job (any sent with it are ignored); without one it is a manual entry for a job found
// elsewhere, and `company` and `title` are required.
export const createApplicationSchema = z.object({
  jobId: z.string().trim().min(1).max(200).optional(),
  company: requiredText(200).optional(),
  title: requiredText(200).optional(),
  url: postingUrl.optional(),
  source: optionalText(100).optional(),
  status: status.default('applied'),
  notes: notes.default(''),
  appliedAt: calendarDate.optional(),
  followUpAt: calendarDate.optional()
}).superRefine((data, context) => {
  if (data.jobId) return
  for (const field of ['company', 'title'] as const) {
    if (!data[field]) context.addIssue({ code: 'custom', path: [field], message: 'Required' })
  }
})

// PATCH /me/applications/:id: only the fields sent change
export const updateApplicationSchema = z.object({
  company: requiredText(200).optional(),
  title: requiredText(200).optional(),
  url: postingUrl.optional(),
  source: optionalText(100).optional(),
  status: status.optional(),
  notes: notes.optional(),
  appliedAt: calendarDate.optional(),
  followUpAt: calendarDate.optional()
}).refine((data) => Object.values(data).some((value) => value !== undefined), 'Nothing to update')

export type NewApplication = z.infer<typeof createApplicationSchema>
export type ApplicationChanges = z.infer<typeof updateApplicationSchema>

// `:id` in the routes: anything else can't be an application
export const applicationIdSchema = z.string().regex(/^[1-9]\d{0,14}$/).transform(Number)
