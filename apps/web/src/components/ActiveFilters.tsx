import type { SourceSummary } from '@codehired/shared/api'
import { MIN_SALARIES, POSTED_WITHIN, US_STATES } from '../config.ts'
import type { FilterKey, Option, SearchFilterValues } from '../config.ts'
import { employmentTypeLabel, levelLabel, technologyLabel, workplaceLabel } from '../utils/format.ts'
import styles from './ActiveFilters.module.css'

const optionLabel = (options: Option[], value: string) => options.find((option) => option.value === value)?.label ?? value

// How each filter reads on its chip, in the order the chips are shown
const CHIP_LABELS: Record<FilterKey, (value: string, sources: SourceSummary[]) => string> = {
  text: (value) => `“${value}”`,
  technology: technologyLabel,
  level: levelLabel,
  workplace: workplaceLabel,
  postedWithin: (value) => optionLabel(POSTED_WITHIN, value),
  state: (value) => optionLabel(US_STATES, value),
  employmentType: employmentTypeLabel,
  minSalary: (value) => optionLabel(MIN_SALARIES, value),
  source: (value, sources) => sources.find((source) => source.id === value)?.name ?? value,
  hasSalary: () => 'Salary shown'
}

interface ActiveFiltersProps {
  filters: SearchFilterValues
  sources: SourceSummary[]
  onRemove: (key: FilterKey) => void
  onClear: () => void
}

// The filters in use, each one a button that removes it
export function ActiveFilters ({ filters, sources, onRemove, onClear }: ActiveFiltersProps) {
  const active = (Object.keys(CHIP_LABELS) as FilterKey[]).filter((key) => filters[key])
  if (active.length === 0) return null

  return (
    <div className={styles.chips}>
      <ul aria-label='Active filters'>
        {active.map((key) => {
          const label = CHIP_LABELS[key](filters[key], sources)
          return (
            <li key={key}>
              <button type='button' className={styles.chip} onClick={() => onRemove(key)} aria-label={`Remove filter: ${label}`}>
                <span className={styles.label}>{label}</span>
                <span aria-hidden='true' className={styles.remove}>×</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type='button' className={styles.clear} onClick={onClear}>Clear all</button>
    </div>
  )
}
