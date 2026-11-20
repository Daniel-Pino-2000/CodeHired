import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  experienceLabel,
  findSkill,
  jobsForYouFilters,
  jobsForYouPath,
  profileLinks,
  toFormValues,
  toRequestBody,
  validateProfile
} from './profile.js'

const PROFILE = {
  headline: 'Frontend developer',
  location: 'Austin, TX',
  bio: 'I build web apps.',
  skills: ['react', 'typescript'],
  yearsOfExperience: 4,
  desiredLevel: 'mid',
  desiredWorkplace: 'remote',
  links: { github: 'https://github.com/ana', linkedin: null, portfolio: 'https://ana.dev' },
  resumeUrl: 'https://drive.google.com/file/d/abc/view',
  updatedAt: '2026-11-19T10:00:00Z'
}

const EMPTY = {
  headline: null,
  location: null,
  bio: '',
  skills: [],
  yearsOfExperience: null,
  desiredLevel: null,
  desiredWorkplace: null,
  links: { github: null, linkedin: null, portfolio: null },
  resumeUrl: null,
  updatedAt: null
}

const LABELS = { node: 'Node.js', react: 'React', 'next.js': 'Next.js', go: 'Go' }

describe('the profile form', () => {
  test('turns a profile into form values and those into the request', () => {
    const values = toFormValues(PROFILE)

    assert.equal(values.yearsOfExperience, '4')
    assert.equal(values['links.linkedin'], '')
    assert.deepEqual(toRequestBody(values), {
      headline: 'Frontend developer',
      location: 'Austin, TX',
      bio: 'I build web apps.',
      skills: ['react', 'typescript'],
      yearsOfExperience: 4,
      desiredLevel: 'mid',
      desiredWorkplace: 'remote',
      links: { github: 'https://github.com/ana', linkedin: '', portfolio: 'https://ana.dev' },
      resumeUrl: 'https://drive.google.com/file/d/abc/view'
    })
  })

  test('sends blank choices and years as null', () => {
    const body = toRequestBody(toFormValues(EMPTY))

    assert.equal(body.yearsOfExperience, null)
    assert.equal(body.desiredLevel, null)
    assert.equal(body.desiredWorkplace, null)
    assert.equal(body.headline, '')
  })

  test('accepts an empty profile and a full one', () => {
    assert.deepEqual(validateProfile(toFormValues(EMPTY)), {})
    assert.deepEqual(validateProfile(toFormValues(PROFILE)), {})
  })

  test('names each field that is wrong', () => {
    const errors = validateProfile({
      ...toFormValues(EMPTY),
      headline: 'x'.repeat(121),
      yearsOfExperience: '2.5',
      'links.github': 'https://gitlab.com/ana',
      'links.linkedin': 'https://linkedin.com.evil.example/in/ana',
      'links.portfolio': 'ana.dev',
      resumeUrl: 'javascript:alert(1)'
    })

    assert.deepEqual(Object.keys(errors).sort(), [
      'headline', 'links.github', 'links.linkedin', 'links.portfolio', 'resumeUrl', 'yearsOfExperience'
    ])
  })

  test('takes LinkedIn country subdomains and years from 0 to 60', () => {
    const values = { ...toFormValues(EMPTY), 'links.linkedin': 'https://uk.linkedin.com/in/ana' }

    assert.deepEqual(validateProfile({ ...values, yearsOfExperience: '0' }), {})
    assert.deepEqual(validateProfile({ ...values, yearsOfExperience: '60' }), {})
    assert.ok(validateProfile({ ...values, yearsOfExperience: '61' }).yearsOfExperience)
    assert.ok(validateProfile({ ...values, yearsOfExperience: '-1' }).yearsOfExperience)
  })
})

describe('findSkill', () => {
  test('finds a technology by its label or its slug, in any case', () => {
    assert.equal(findSkill('node.js', LABELS), 'node')
    assert.equal(findSkill(' NODE ', LABELS), 'node')
    assert.equal(findSkill('Next.js', LABELS), 'next.js')
  })

  test('is null for anything else', () => {
    assert.equal(findSkill('', LABELS), null)
    assert.equal(findSkill('cobol', LABELS), null)
    assert.equal(findSkill('constructor', LABELS), null)
  })
})

describe('jobs for you', () => {
  test('searches by the skills, level and workplace the profile has', () => {
    assert.deepEqual(jobsForYouFilters(PROFILE), { technology: 'react,typescript', level: 'mid', workplace: 'remote' })
    assert.deepEqual(jobsForYouFilters({ ...EMPTY, desiredWorkplace: 'hybrid' }), { workplace: 'hybrid' })
    assert.equal(jobsForYouPath(PROFILE), '/search?technology=react,typescript&level=mid&workplace=remote')
  })

  test('has nothing to go on without them', () => {
    assert.equal(jobsForYouFilters(EMPTY), null)
    assert.equal(jobsForYouFilters(null), null)
    assert.equal(jobsForYouPath(EMPTY), '/search')
  })
})

describe('the profile preview', () => {
  test('lists the links that are set', () => {
    assert.deepEqual(profileLinks(PROFILE).map(({ label }) => label), ['GitHub', 'Portfolio', 'Resume'])
    assert.deepEqual(profileLinks(EMPTY), [])
  })

  test('says how long they have worked', () => {
    assert.equal(experienceLabel(null), null)
    assert.equal(experienceLabel(0), 'New to the field')
    assert.equal(experienceLabel(1), '1 year of experience')
    assert.equal(experienceLabel(4), '4 years of experience')
  })
})
