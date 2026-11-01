import { describe, expect, expectTypeOf, it } from 'vitest'

import { dbDateToDateString } from '@/lib/date'
import { toApiJson } from '@/server/api/serialize'

describe('toApiJson', () => {
  it('キーを入れ子まで snake_case にし、Date（瞬間）を +09:00 付きの JST にする（docs/api.md §1.1）', () => {
    const report = {
      reportDate: dbDateToDateString(new Date('2026-10-31T00:00:00Z')),
      submittedAt: new Date('2026-10-31T09:05:00Z'),
      comments: [{ createdAt: new Date('2026-10-31T10:10:00Z'), commenter: { id: 1 } }],
    }

    expect(toApiJson(report)).toEqual({
      report_date: '2026-10-31',
      submitted_at: '2026-10-31T18:05:00+09:00',
      comments: [{ created_at: '2026-10-31T19:10:00+09:00', commenter: { id: 1 } }],
    })
  })

  it('UTC 15:00 は JST の翌日 0:00 になる', () => {
    expect(toApiJson({ createdAt: new Date('2026-10-31T15:00:00Z') })).toEqual({
      created_at: '2026-11-01T00:00:00+09:00',
    })
  })

  it('null・プリミティブ・プロトタイプが null のオブジェクトも扱える', () => {
    const input = Object.assign(Object.create(null) as object, { submittedAt: null, visitCount: 3 })
    expect(toApiJson(input)).toEqual({ submitted_at: null, visit_count: 3 })
    expect(toApiJson('text')).toBe('text')
  })

  it('型も snake_case のキーになり、Date は string になる', () => {
    const result = toApiJson({ submittedAt: new Date() as Date | null, visitRecords: [{ sortOrder: 1 }] })
    expectTypeOf(result).toEqualTypeOf<{ submitted_at: string | null; visit_records: { sort_order: number }[] }>()
  })
})
