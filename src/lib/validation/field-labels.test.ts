import { describe, expect, it } from 'vitest'

import { formatFieldPath, labelForPath, ROOT_LABEL } from '@/lib/validation/field-labels'

describe('formatFieldPath', () => {
  it('入れ子の配列を visit_records[1].content の形式にする（docs/api.md §1.5）', () => {
    expect(formatFieldPath(['visit_records', 1, 'content'])).toBe('visit_records[1].content')
  })

  it('配列そのもの・入れ子のオブジェクト・空のパスを表記できる', () => {
    expect(formatFieldPath(['visit_records', 0])).toBe('visit_records[0]')
    expect(formatFieldPath(['sales_staff', 'name'])).toBe('sales_staff.name')
    expect(formatFieldPath([])).toBe('')
  })
})

describe('labelForPath', () => {
  it('パスの最後の項目名で辞書を引く', () => {
    expect(labelForPath(['visit_records', 1, 'content'])).toBe('訪問内容')
    expect(labelForPath(['visit_records', 1])).toBe('訪問記録')
  })

  it('上書きの指定を辞書より優先する', () => {
    expect(labelForPath(['name'], { name: '氏名' })).toBe('氏名')
  })

  it('辞書にない項目名はそのまま使い、パスがなければ「リクエスト」にする', () => {
    expect(labelForPath(['unknown_field'])).toBe('unknown_field')
    expect(labelForPath([])).toBe(ROOT_LABEL)
  })
})
