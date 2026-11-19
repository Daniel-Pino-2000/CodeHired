import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { addSaved, removeSaved, savedIds, savedJobPath, toSavedJob } from './savedJobs.js'

const job = (id, savedAt) => ({ id, title: `Job ${id}`, savedAt, open: true })

describe('toSavedJob', () => {
  test('adds the save date and drops the detail-only fields', () => {
    const detail = { id: 'a', title: 'Engineer', descriptionHtml: '<p>Hi</p>', alsoPostedOn: [] }
    assert.deepEqual(toSavedJob(detail, '2026-11-19T10:00:00Z'), {
      id: 'a', title: 'Engineer', savedAt: '2026-11-19T10:00:00Z', open: true
    })
  })

  test('keeps a job marked as no longer open', () => {
    assert.equal(toSavedJob({ id: 'a', open: false }, '2026-11-19T10:00:00Z').open, false)
  })
})

describe('addSaved', () => {
  const list = [job('c', '2026-11-03T00:00:00Z'), job('b', '2026-11-02T00:00:00Z'), job('a', '2026-11-01T00:00:00Z')]

  test('puts a new save first', () => {
    const saved = addSaved(list, job('d', '2026-11-04T00:00:00Z'))
    assert.deepEqual(saved.map((item) => item.id), ['d', 'c', 'b', 'a'])
  })

  test('puts a job back where its save date belongs', () => {
    const saved = addSaved(removeSaved(list, 'b'), list[1])
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
