import { useEffect, useId, useRef, useState } from 'react'
import { LEVELS, TECHNOLOGIES, WORKPLACES } from '../config.js'
import styles from './SearchFilters.module.css'

const TEXT_DEBOUNCE_MS = 300

export function SearchFilters ({ filters, onChange, onClear }) {
  const id = useId()
  const debounceRef = useRef()

  // The text box updates instantly, but only tells the parent after the user stops typing.
  // If the filter changes from outside (e.g. "Clear filters"), sync the box during render.
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

  const handleSelectChange = (event) => {
    onChange({ [event.target.name]: event.target.value })
  }

  const hasFilters = Boolean(filters.text || filters.technology || filters.level || filters.workplace)

  return (
    <form className={styles.filters} role='search' onSubmit={(event) => event.preventDefault()}>
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

      <label htmlFor={`${id}-technology`} className='visually-hidden'>Technology</label>
      <select id={`${id}-technology`} className='select' name='technology' value={filters.technology} onChange={handleSelectChange}>
        <option value=''>Any technology</option>
        {TECHNOLOGIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>

      <label htmlFor={`${id}-level`} className='visually-hidden'>Experience level</label>
      <select id={`${id}-level`} className='select' name='level' value={filters.level} onChange={handleSelectChange}>
        <option value=''>Any level</option>
        {LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>

      <label htmlFor={`${id}-workplace`} className='visually-hidden'>Workplace</label>
      <select id={`${id}-workplace`} className='select' name='workplace' value={filters.workplace} onChange={handleSelectChange}>
        <option value=''>Any workplace</option>
        {WORKPLACES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>

      <button type='button' className='button button-secondary' onClick={onClear} disabled={!hasFilters}>
        Clear filters
      </button>
    </form>
  )
}
