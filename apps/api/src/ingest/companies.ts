// The company career boards CodeHired reads. To add one, see "How to add a company" in CONTRIBUTING.md.
import { z } from 'zod'
import companiesJson from './companies.json' with { type: 'json' }

export const ATS_PLATFORMS = ['greenhouse', 'lever', 'ashby'] as const
export type AtsPlatform = (typeof ATS_PLATFORMS)[number]

export const companySchema = z.object({
  // Shown as the job's company, whatever the board calls itself
  name: z.string().trim().min(1).max(120),
  ats: z.enum(ATS_PLATFORMS),
  // The board's name in the ATS URL: boards.greenhouse.io/{token}, jobs.lever.co/{token}, jobs.ashbyhq.com/{token}
  token: z.string().regex(/^[A-Za-z0-9._-]+$/, 'letters, digits, dots, dashes and underscores only'),
  website: z.url({ protocol: /^https$/ })
})

export type Company = z.infer<typeof companySchema>

// Fails on a typo or on the same board listed twice, so a bad entry never reaches a run
export const companiesSchema = z.array(companySchema).superRefine((companies, ctx) => {
  const seen = new Set<string>()
  companies.forEach((company, index) => {
    const key = `${company.ats}/${company.token.toLowerCase()}`
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', message: `${key} is listed more than once`, path: [index, 'token'] })
    }
    seen.add(key)
  })
})

export const COMPANIES: readonly Company[] = companiesSchema.parse(companiesJson)

export function companiesOn (ats: AtsPlatform, companies: readonly Company[] = COMPANIES) {
  return companies.filter((company) => company.ats === ats)
}
