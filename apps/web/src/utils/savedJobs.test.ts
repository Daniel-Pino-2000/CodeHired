import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Job, SavedJob } from '@codehired/shared/api'
import { addSaved, removeSaved, savedIds, savedJobPath, toSavedJob } from './savedJobs.ts'

const listedJob = (id: string): Job => ({
  id,
  title: `Job ${id}`,
  company: 'Acme',
  location: 'Remote, US',
  workplace: 'remote',
  level: 'mid',
  employmentType: 'full-time',
  salaryMin: null,
  salaryMax: null,
  currency: 'USD',
  technologies: [],
  description: 'Build things.',
  descriptionIsSnippet: false,
  createdAt: '2026-11-01T00:00:00Z',
  postedAt: null,
  closesAt: null,
  source: null,
  companyProfile: null
})

const job = (id: string, savedAt: string): SavedJob => ({ ...listedJob(id), savedAt, open: true })

describe('toSavedJob', () => {
  test('adds the save date and drops the detail-only fields', () => {
    const detail = { ...listedJob('a'), descriptionHtml: '<p>Hi</p>', alsoPostedOn: [] }
    assert.deepEqual(toSavedJob(detail, '2026-11-19T10:00:00Z'), {
      ...listedJob('a'), savedAt: '2026-11-19T10:00:00Z', open: true
    })
  })

  test('keeps a job marked as no longer open', () => {
    assert.equal(toSavedJob({ ...job('a', '2026-11-01T00:00:00Z'), open: false }, '2026-11-19T10:00:00Z').open, false)
  })
})

describe('addSaved', () => {
  const list = [job('c', '2026-11-03T00:00:00Z'), job('b', '2026-11-02T00:00:00Z'), job('a', '2026-11-01T00:00:00Z')]

  test('puts a new save first', () => {
    const saved = addSaved(list, job('d', '2026-11-04T00:00:00Z'))
    assert.deepEqual(saved.map((item) => item.id), ['d', 'c', 'b', 'a'])
  })

  test('puts a job back where its save date belongs', () => {
    const saved = addSaved(removeSaved(list, 'b'), job('b', '2026-11-02T00:00:00Z'))
    assert.deepEqual(saved.map((item) => item.id), ['c', 'b', 'a'])
  })

  test('appends the oldest save and never duplicates a job', () => {
    assert.deepEqual(addSaved(list, job('z', '2026-10-01T00:00:00Z')).map((item) => item.id), ['c', 'b', 'a', 'z'])
    assert.deepEqual(addSaved(list, job('a', '2026-11-05T00:00:00Z')).map((item) => item.id), ['a', 'c', 'b'])
  })

  test('does not change the list it was given', () => {
    addSaved(list, job('d', '2026-11-04T00:00:00Z'))
    assert.equal(list.length, 3)
  })
})

describe('removeSaved and savedIds', () => {
  test('removes only the job with that id', () => {
    const list = [job('a', '2026-11-01T00:00:00Z'), job('b', '2026-11-02T00:00:00Z')]
    assert.deepEqual(removeSaved(list, 'a').map((item) => item.id), ['b'])
    assert.deepEqual(removeSaved(list, 'x'), list)
    assert.deepEqual(savedIds(list), new Set(['a', 'b']))
  })
})

test('savedJobPath encodes the job id', () => {
  assert.equal(savedJobPath('a/b c'), '/me/saved-jobs/a%2Fb%20c')
})
