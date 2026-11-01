import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ValidationError } from '@/server/api/errors'
import { parseInput, parseSearchParams } from '@/server/api/validation'
import { paginationQuerySchema } from '@/schemas/pagination'

function catchError(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('例外が発生しませんでした')
}

describe('parseInput', () => {
  it('検証に通ると、キーを camelCase にして返す', () => {
    const schema = z.object({ sales_staff_id: z.int(), visit_records: z.array(z.object({ customer_id: z.int() })) })

    expect(parseInput(schema, { sales_staff_id: 2, visit_records: [{ customer_id: 10 }] })).toEqual({
      salesStaffId: 2,
      visitRecords: [{ customerId: 10 }],
    })
  })

  it('エラーなら、全項目のエラーを持った ValidationError を投げる', () => {
    const schema = z.object({ problem: z.string().max(3), plan: z.string() })
    const error = catchError(() => parseInput(schema, { problem: 'あいうえ' }))

    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).details).toEqual([
      { field: 'problem', message: 'Problemは3文字以内で入力してください' },
      { field: 'plan', message: 'Planは必須です' },
    ])
  })

  it('項目名を上書きできる', () => {
    const error = catchError(() => parseInput(z.object({ name: z.string() }), {}, { labels: { name: '顧客名' } }))
    expect((error as ValidationError).details).toEqual([{ field: 'name', message: '顧客名は必須です' }])
  })

  it('リクエスト全体のエラーは field が空文字になる', () => {
    const error = catchError(() => parseInput(z.object({}), 'abc'))
    expect((error as ValidationError).details).toEqual([{ field: '', message: 'リクエストの形式が正しくありません' }])
  })
})

describe('parseSearchParams', () => {
  it('クエリ文字列を検証して camelCase で返す（ページングの既定値も入る）', () => {
    const params = new URLSearchParams('customer_name=ABC&page=2')
    const schema = paginationQuerySchema.extend({ customer_name: z.string().optional() })

    expect(parseSearchParams(params, schema)).toEqual({ customerName: 'ABC', page: 2, perPage: 20 })
  })

  it('不正な値は 400 の ValidationError になる', () => {
    const error = catchError(() => parseSearchParams(new URLSearchParams('per_page=500'), paginationQuerySchema))
    expect((error as ValidationError).details).toEqual([
      { field: 'per_page', message: '1ページの件数は100以下で入力してください' },
    ])
  })
})
