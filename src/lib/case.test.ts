import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  type CamelCaseKeys,
  type SnakeCaseKeys,
  toCamelCase,
  toCamelCaseKeys,
  toSnakeCase,
  toSnakeCaseKeys,
} from '@/lib/case'

describe('toSnakeCase / toCamelCase', () => {
  it.each([
    ['visitRecords', 'visit_records'],
    ['salesStaffId', 'sales_staff_id'],
    ['id', 'id'],
    ['perPage', 'per_page'],
  ])('%s と %s を相互に変換できる', (camel, snake) => {
    expect(toSnakeCase(camel)).toBe(snake)
    expect(toCamelCase(snake)).toBe(camel)
  })

  it('変換済みのキーはそのまま返す', () => {
    expect(toSnakeCase('visit_records')).toBe('visit_records')
    expect(toCamelCase('visitRecords')).toBe('visitRecords')
  })
})

describe('toSnakeCaseKeys', () => {
  it('入れ子のオブジェクト・配列の中のキーまで snake_case にする', () => {
    const input = {
      reportDate: '2026-10-31',
      salesStaff: { id: 2, name: '山田太郎' },
      visitRecords: [{ customerId: 10, sortOrder: 1 }],
    }

    expect(toSnakeCaseKeys(input)).toEqual({
      report_date: '2026-10-31',
      sales_staff: { id: 2, name: '山田太郎' },
      visit_records: [{ customer_id: 10, sort_order: 1 }],
    })
  })

  it('Date・null・プリミティブはそのまま返し、値（文字列）は変換しない', () => {
    const submittedAt = new Date('2026-10-31T09:05:00Z')
    const result = toSnakeCaseKeys({ submittedAt, problem: null, status: 'submitted', note: 'camelCase' })

    expect(result.submitted_at).toBe(submittedAt)
    expect(result.problem).toBeNull()
    expect(result.status).toBe('submitted')
    expect(result.note).toBe('camelCase')
    expect(toSnakeCaseKeys(1)).toBe(1)
  })

  it('プロトタイプが null のオブジェクトも変換する', () => {
    const input = Object.assign(Object.create(null) as object, { perPage: 20 })
    expect(toSnakeCaseKeys(input)).toEqual({ per_page: 20 })
  })

  it('型も snake_case のキーになる', () => {
    const result = toSnakeCaseKeys({ visitRecords: [{ customerId: 1 }], submittedAt: new Date() })
    expectTypeOf(result).toEqualTypeOf<{ visit_records: { customer_id: number }[]; submitted_at: Date }>()
    expectTypeOf<SnakeCaseKeys<{ totalCount: number }>>().toEqualTypeOf<{ total_count: number }>()
  })
})

describe('toCamelCaseKeys', () => {
  it('入れ子のオブジェクト・配列の中のキーまで camelCase にする', () => {
    const input = { report_date: '2026-10-31', visit_records: [{ customer_id: 10, visited_at: null }] }

    expect(toCamelCaseKeys(input)).toEqual({
      reportDate: '2026-10-31',
      visitRecords: [{ customerId: 10, visitedAt: null }],
    })
  })

  it('型も camelCase のキーになる', () => {
    expectTypeOf<CamelCaseKeys<{ visit_records: { customer_id: number }[] }>>().toEqualTypeOf<{
      visitRecords: { customerId: number }[]
    }>()
  })
})
