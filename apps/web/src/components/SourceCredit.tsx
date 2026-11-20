import type { SourceCreditLabel } from '@codehired/shared/api'
import styles from './SourceCredit.module.css'

// The label some sources' terms require on every job they supply. Adzuna's terms: each advert is
// labelled "Adzuna", at least 116 x 23 pixels, linked to adzuna.com. A plain followed link.
export function SourceCredit ({ credit, className = '' }: { credit?: SourceCreditLabel | null, className?: string }) {
  if (!credit) return null
  return (
    <a href={credit.url} className={`${styles.credit} ${className}`} target='_blank' rel='noopener noreferrer'>
      {credit.text}
    </a>
  )
}
