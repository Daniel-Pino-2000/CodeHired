import { useId, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { TECHNOLOGY_LABELS } from '../config.ts'
import { technologyLabel } from '../utils/format.ts'
import { findSkill, PROFILE_LIMITS } from '../utils/profile.ts'
import fieldStyles from './Field.module.css'
import styles from './SkillsInput.module.css'

// Every technology jobs are tagged with, by name
const OPTIONS = Object.entries(TECHNOLOGY_LABELS)
  .map(([slug, label]) => ({ slug, label }))
  .toSorted((a, b) => a.label.localeCompare(b.label))

interface SkillsInputProps {
  label: string
  // The skills' slugs
  value: string[]
  onChange: (skills: string[]) => void
  error?: string
  hint?: string
}

// Picks skills from the technology dictionary, so each one can match jobs. Type a name and press
// Enter (or pick it from the suggestions); each skill is a chip that removes it.
export function SkillsInput ({ label, value, onChange, error, hint }: SkillsInputProps) {
  const id = useId()
  const [text, setText] = useState('')
  const [typingError, setTypingError] = useState<string | null>(null)

  const full = value.length >= PROFILE_LIMITS.skills
  const message = typingError ?? error ?? hint

  const add = (typed: string) => {
    const slug = findSkill(typed, TECHNOLOGY_LABELS)
    if (!slug) {
      setTypingError(typed.trim() ? `"${typed.trim()}" isn't in the list. Pick one of the suggestions.` : null)
      return
    }
    if (!value.includes(slug)) onChange([...value, slug])
    setText('')
    setTypingError(null)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    setText(typed)
    setTypingError(null)
    // Picking a suggestion fires an input event that isn't typing (no inputType, or a
    // replacement): add it right away. Typing "Java" must not add Java before "JavaScript".
    const { inputType } = event.nativeEvent as Partial<InputEvent>
    if ((inputType === undefined || inputType === 'insertReplacementText') && findSkill(typed, TECHNOLOGY_LABELS)) add(typed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Enter adds the skill instead of submitting the whole form
      event.preventDefault()
      add(text)
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const remove = (slug: string) => onChange(value.filter((skill) => skill !== slug))

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={`${id}-input`} className={fieldStyles.label}>{label}</label>

      {value.length > 0 && (
        <ul className={styles.chips} aria-label='Your skills'>
          {value.map((slug) => (
            <li key={slug}>
              <button type='button' className={styles.chip} onClick={() => remove(slug)} aria-label={`Remove ${technologyLabel(slug)}`}>
                {technologyLabel(slug)}
                <span aria-hidden='true' className={styles.remove}>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.row}>
        <input
          id={`${id}-input`}
          className='input'
          list={`${id}-options`}
          value={text}
          placeholder={full ? `That's ${PROFILE_LIMITS.skills}, the most a profile lists` : 'React, Python, AWS…'}
          disabled={full}
          autoComplete='off'
          aria-invalid={typingError || error ? 'true' : undefined}
          aria-describedby={message ? `${id}-message` : undefined}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          // A full name left in the box still counts, so Save doesn't drop it
          onBlur={() => findSkill(text, TECHNOLOGY_LABELS) && add(text)}
        />
        <button type='button' className='button button-secondary' onClick={() => add(text)} disabled={full || !text.trim()}>Add</button>
      </div>
      <datalist id={`${id}-options`}>
        {OPTIONS.filter(({ slug }) => !value.includes(slug)).map(({ slug, label: name }) => <option key={slug} value={name} />)}
      </datalist>

      {message && (
        <p id={`${id}-message`} className={typingError || error ? fieldStyles.error : fieldStyles.hint} aria-live='polite'>{message}</p>
      )}
    </div>
  )
}
