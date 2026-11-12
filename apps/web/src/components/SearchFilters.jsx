import { useEffect, useId, useRef, useState } from 'react'
import {
  EMPLOYMENT_TYPES,
  LEVELS,
  MIN_SALARIES,
  MORE_FILTER_KEYS,
  POSTED_WITHIN,
  TECHNOLOGIES,
  US_STATES,
  WORKPLACES
} from '../config.js'
import styles from './SearchFilters.module.css'

const TEXT_DEBOUNCE_MS = 300

// A labelled <select> whose first option means "not set"
function Select ({ id, name, label, anyLabel, options, filters, onChange }) {
  return (
    <>
      <label htmlFor={`${id}-${name}`} className='visually-hidden'>{label}</label>
      <select
        id={`${id}-${name}`}
        className='select'
        name={name}
        value={filters[name]}
        onChange={(event) => onChange({ [name]: event.target.value })}
      >
        <option value=''>{anyLabel}</option>
        {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </>
  )
}

export function SearchFilters ({ filters, sources, onChange }) {
  const id = useId()
  const debounceRef = useRef()
  const [moreOpen, setMoreOpen] = useState(false)

  // The text box updates instantly, but only tells the parent after the user stops typing.
  // If the filter changes from outside (e.g. removing its chip), sync the box during render.
  const [text, setText] = useState(filters.text)
  const [previousText, setPreviousText] = useState(filters.text)
  if (filters.text !== previousText) {
    setPreviousText(filters.text)
    setText(filters.text)
  }

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const handleTextChange = (event) => {
    const value = event.target.value
    setText(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange({ text: value }), TEXT_DEBOUNCE_MS)
  }

  const moreCount = MORE_FILTER_KEYS.filter((key) => filters[key]).length
  const sourceOptions = sources.map(({ id: value, name: label }) => ({ value, label }))
  const selectProps = { id, filters, onChange }

  return (
    <form className={styles.filters} role='search' onSubmit={(event) => event.preventDefault()}>
      <div className={styles.main}>
        <div className={styles.textField}>
          <label htmlFor={`${id}-text`} className='visually-hidden'>Search jobs</label>
          <input
            id={`${id}-text`}
            className='input'
            type='search'
            name='text'
            placeholder='Job title, company or keyword'
            autoComplete='off'
            value={text}
            onChange={handleTextChange}
          />
        </div>

        <Select {...selectProps} name='technology' label='Technology' anyLabel='Any technology' options={TECHNOLOGIES} />
        <Select {...selectProps} name='level' label='Experience level' anyLabel='Any level' options={LEVELS} />
        <Select {...selectProps} name='workplace' label='Workplace' anyLabel='Any workplace' options={WORKPLACES} />

        {/* Only shown on small screens, where the other filters start collapsed */}
        <button
          type='button'
          className={`button button-secondary ${styles.toggle}`}
          aria-expanded={moreOpen}
          aria-controls={`${id}-more`}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          {moreOpen ? 'Fewer filters' : 'More filters'}
          {moreCount > 0 && (
            <span className={styles.count}>
              {moreCount}<span className='visually-hidden'> active</span>
            </span>
          )}
        </button>
      </div>

      <div id={`${id}-more`} className={`${styles.more} ${moreOpen ? styles.open : ''}`}>
        <Select {...selectProps} name='postedWithin' label='Date posted' anyLabel='Any date' options={POSTED_WITHIN} />
        <Select {...selectProps} name='state' label='US state' anyLabel='Any state' options={US_STATES} />
        <Select {...selectProps} name='employmentType' label='Contract' anyLabel='Any contract' options={EMPLOYMENT_TYPES} />
        <Select {...selectProps} name='minSalary' label='Minimum salary' anyLabel='Any salary' options={MIN_SALARIES} />
        <Select {...selectProps} name='source' label='Source' anyLabel='Any source' options={sourceOptions} />

        <label className={styles.checkbox}>
          <input
            type='checkbox'
            name='hasSalary'
            checked={filters.hasSalary === 'true'}
            onChange={(event) => onChange({ hasSalary: event.target.checked ? 'true' : '' })}
          />
          Salary shown
        </label>
      </div>
    </form>
  )
}
