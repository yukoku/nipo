import { describe, expect, it } from 'vitest'

import { planVisitRecordChanges } from './visit-record-changes'

describe('planVisitRecordChanges（U-05：訪問記録の差分）', () => {
  it('U-05・T-RPT-62: 既存 A・B・C に「A（変更）, 新規 D」を送ると、A は更新・D は追加・B と C は削除、sort_order は A=1, D=2', () => {
    const changes = planVisitRecordChanges([1, 2, 3], [{ id: 1, data: 'A（変更）' }, { data: 'D' }])

    expect(changes).toEqual({
      updates: [{ id: 1, data: 'A（変更）', sortOrder: 1 }],
      creates: [{ data: 'D', sortOrder: 2 }],
      deleteIds: [2, 3],
      unknownIdIndexes: [],
    })
  })

  it('並び替えだけなら、全行を更新して sort_order を送られた順に振り直す', () => {
    const changes = planVisitRecordChanges([1, 2, 3], [{ id: 3, data: 'C' }, { id: 1, data: 'A' }, { id: 2, data: 'B' }])

    expect(changes.updates.map((u) => [u.id, u.sortOrder])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
    ])
    expect(changes.creates).toEqual([])
    expect(changes.deleteIds).toEqual([])
  })

  it('空の配列を送ると、既存の行をすべて削除する（訪問記録 0 件。決定事項 #8）', () => {
    expect(planVisitRecordChanges([1, 2], [])).toEqual({ updates: [], creates: [], deleteIds: [1, 2], unknownIdIndexes: [] })
  })

  it('既存の行がない日報には、すべて追加する', () => {
    const changes = planVisitRecordChanges([], [{ data: 'X' }, { data: 'Y' }])

    expect(changes.creates).toEqual([
      { data: 'X', sortOrder: 1 },
      { data: 'Y', sortOrder: 2 },
    ])
    expect(changes.deleteIds).toEqual([])
  })

  it('T-RPT-68: この日報の訪問記録でない id は、その行の位置を返し、更新・削除の対象にしない', () => {
    const changes = planVisitRecordChanges([1, 2], [{ id: 1, data: 'A' }, { id: 505, data: '他の日報の行' }, { data: 'new' }])

    expect(changes.unknownIdIndexes).toEqual([1])
    expect(changes.updates.map((u) => u.id)).toEqual([1])
    // 位置（sort_order）は、送られてきた順のまま
    expect(changes.creates).toEqual([{ data: 'new', sortOrder: 3 }])
    expect(changes.deleteIds).toEqual([2])
  })
})
