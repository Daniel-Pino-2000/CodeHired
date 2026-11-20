import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  applicationPath,
  applicationsByJob,
  groupByStatus,
  isFollowUpDue,
  localToday,
  removeApplication,
  statusLabel,
  toCsv,
  toFormValues,
  toRequestBody,
  upsertApplication,
  validateApplication
} from './applications.js'

const application = (id, fields = {}) => ({
  id, jobId: null, company: 'Acme', title: `Job ${id}`, url: null, source: null,
  status: 'applied', notes: '', appliedAt: '2026-11-01', followUpAt: null, ...fields
})

describe('localToday', () => {
  test('is the local calendar date, zero-padded', () => {
    assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
    assert.equal(localToday(new Date(2026, 11, 31, 0, 0)), '2026-12-31')
  })
})

describe('isFollowUpDue', () => {
  const today = '2026-11-19'

  test('is due today and when overdue, not before', () => {
    assert.equal(isFollowUpDue(application(1, { followUpAt: '2026-11-19' }), today), true)
    assert.equal(isFollowUpDue(application(1, { followUpAt: '2026-11-02' }), today), true)
    assert.equal(isFollowUpDue(application(1, { followUpAt: '2026-11-20' }), today), false)
    assert.equal(isFollowUpDue(application(1), today), false)
  })

  test('is never due on an application that ended', () => {
    for (const status of ['rejected', 'withdrawn']) {
      assert.equal(isFollowUpDue(application(1, { status, followUpAt: '2026-11-01' }), today), false)
    }
    for (const status of ['saved', 'applied', 'interviewing', 'offer']) {
      assert.equal(isFollowUpDue(application(1, { status, followUpAt: '2026-11-01' }), today), true)
    }
  })
})

describe('groupByStatus', () => {
  test('groups in the statuses order, leaves out empty ones and puts due follow-ups first', () => {
    const list = [
      application(1, { status: 'interviewing' }),
      application(2),
      application(3, { followUpAt: '2026-11-18' }),
      application(4, { status: 'saved', appliedAt: null })
    ]

    const groups = groupByStatus(list, '2026-11-19')

    assert.deepEqual(groups.map((group) => [group.status, group.label, group.items.map((item) => item.id)]), [
      ['saved', 'Saved', [4]],
      ['applied', 'Applied', [3, 2]],
      ['interviewing', 'Interviewing', [1]]
    ])
  })

  test('is empty without applications', () => {
    assert.deepEqual(groupByStatus([], '2026-11-19'), [])
  })
})

describe('upsertApplication and removeApplication', () => {
  const list = [application(3), application(2), application(1)]

  test('puts a new or changed application first, once', () => {
    assert.deepEqual(upsertApplication(list, application(4)).map((item) => item.id), [4, 3, 2, 1])
    const changed = upsertApplication(list, application(1, { status: 'offer' }))
    assert.deepEqual(changed.map((item) => [item.id, item.status]), [[1, 'offer'], [3, 'applied'], [2, 'applied']])
  })

  test('removes by id', () => {
    assert.deepEqual(removeApplication(list, 2).map((item) => item.id), [3, 1])
    assert.equal(removeApplication(list, 9).length, 3)
  })
})

describe('applicationsByJob', () => {
  test('maps CodeHired jobs to their application and skips manual ones', () => {
    const byJob = applicationsByJob([application(1, { jobId: 'job-a' }), application(2)])
    assert.deepEqual([...byJob.keys()], ['job-a'])
    assert.equal(byJob.get('job-a').id, 1)
  })
})

describe('statusLabel and applicationPath', () => {
  test('label statuses and build paths', () => {
    assert.equal(statusLabel('interviewing'), 'Interviewing')
    assert.equal(statusLabel('unknown'), 'unknown')
    assert.equal(applicationPath(12), '/me/applications/12')
  })
})

describe('toCsv', () => {
  test('writes a header and one row per application', () => {
    const csv = toCsv([application(1, { url: 'https://acme.example.com/jobs/1', source: 'LinkedIn', followUpAt: '2026-11-20' })])
    assert.equal(csv, [
      'Company,Title,Status,Applied on,Follow up on,Where,Link,Notes',
      'Acme,Job 1,applied,2026-11-01,2026-11-20,LinkedIn,https://acme.example.com/jobs/1,',
      ''
    ].join('\r\n'))
  })

  test('quotes commas, quotes and line breaks', () => {
    const csv = toCsv([application(1, { company: 'Acme, Inc.', notes: 'Said "soon"\nCall back' })])
    assert.equal(csv.split('\r\n')[1], '"Acme, Inc.",Job 1,applied,2026-11-01,,,,"Said ""soon""\nCall back"')
  })

  test('keeps cells that look like formulas from running', () => {
    const csv = toCsv([application(1, { notes: '=HYPERLINK("https://evil.example")', title: '-1', company: '@Acme' })])
    assert.equal(csv.split('\r\n')[1], `'@Acme,'-1,applied,2026-11-01,,,,"'=HYPERLINK(""https://evil.example"")"`)
  })
})

describe('validateApplication', () => {
  const values = { company: 'Acme', title: 'Engineer', url: '' }

  test('needs a company and a title', () => {
    assert.deepEqual(validateApplication(values), {})
    assert.deepEqual(Object.keys(validateApplication({ ...values, company: ' ', title: '' })), ['company', 'title'])
  })

  test('only takes web links', () => {
    assert.deepEqual(validateApplication({ ...values, url: 'https://acme.example.com/jobs/1' }), {})
    for (const url of ['javascript:alert(1)', 'acme.example.com', 'ftp://acme.example.com']) {
      assert.ok(validateApplication({ ...values, url }).url, url)
    }
  })
})

describe('toFormValues and toRequestBody', () => {
  test('a new application starts as applied today', () => {
    assert.deepEqual(toFormValues(null, '2026-11-19'), {
      company: '', title: '', url: '', source: '', status: 'applied', appliedAt: '2026-11-19', followUpAt: '', notes: ''
    })
  })

  test('an existing one keeps its values, with blanks for what it lacks', () => {
    const values = toFormValues(application(1, { appliedAt: null, source: 'LinkedIn' }), '2026-11-19')
    assert.equal(values.appliedAt, '')
    assert.equal(values.source, 'LinkedIn')
    assert.equal(values.url, '')
  })

  test('trims the text fields', () => {
    const body = toRequestBody({ ...toFormValues(null, '2026-11-19'), company: ' Acme ', notes: ' Call Sam \n' })
    assert.equal(body.company, 'Acme')
    assert.equal(body.notes, 'Call Sam')
    assert.equal(body.url, '')
  })
})
