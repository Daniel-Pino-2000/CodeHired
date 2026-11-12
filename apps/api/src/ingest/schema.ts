import { z } from 'zod'
import { jobFieldsSchema, withValidSalaryRange } from '../schemas/job.js'
import { toIsoSeconds } from '../utils/dates.js'

const optionalText = z.string().trim().min(1).nullable().default(null)

// What every source adapter must turn its raw jobs into. The runner validates each one with
// this schema and skips the ones that fail, so a bad posting never stops a run.
export const normalizedJobSchema = withValidSalaryRange(jobFieldsSchema.extend({
  // Real postings are less tidy than the seed data: allow longer titles and company names
  title: z.string().trim().min(2).max(200),
  company: z.string().trim().min(1).max(120),
  location: z.string().trim().min(2).max(120),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),

  // The id the source gives the job: stable across runs, unique within the source
  sourceId: z.string().trim().min(1).max(200),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  publisher: optionalText,
  remote: z.boolean(),
  city: optionalText,
  state: optionalText,
  country: z.string().trim().length(2).toUpperCase().nullable().default(null),
  postedAt: z.iso.datetime({ offset: true })
    .transform((value) => toIsoSeconds(new Date(value)))
    .nullable()
    .default(null),
  descriptionHtml: z.string().trim().min(1).nullable().default(null)
}))

export type NormalizedJobInput = z.input<typeof normalizedJobSchema>
export type NormalizedJob = z.output<typeof normalizedJobSchema>
