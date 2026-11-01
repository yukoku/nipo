import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, paginationQuerySchema } from '@/schemas/pagination'

const parse = (input: Record<string, string>) => paginationQuerySchema.safeParse(input, { error: createErrorMap() })

describe('paginationQuerySchema', () => {
  it('指定がなければ page=1・per_page=20 になる', () => {
    expect(DEFAULT_PER_PAGE).toBe(20)
    expect(parse({}).data).toEqual({ page: 1, per_page: 20 })
  })

  it('空の値（?page=&per_page=）は指定なしとして扱う', () => {
    expect(parse({ page: '', per_page: '' }).data).toEqual({ page: 1, per_page: 20 })
  })

  it('クエリ文字列の数字を数値にする', () => {
    expect(parse({ page: '3', per_page: '50' }).data).toEqual({ page: 3, per_page: 50 })
  })

  it('per_page は 100 まで指定でき、101 以上はエラーになる', () => {
    expect(MAX_PER_PAGE).toBe(100)
    expect(parse({ per_page: '100' }).success).toBe(true)
    expect(parse({ per_page: '101' }).error?.issues[0]?.message).toBe('1ページの件数は100以下で入力してください')
  })

  it.each([
    ['0', 'ページ番号は1以上で入力してください'],
    ['1.5', 'ページ番号は整数で入力してください'],
    ['abc', 'ページ番号は数値で入力してください'],
  ])('page=%s はエラーになる', (page, message) => {
    expect(parse({ page }).error?.issues[0]?.message).toBe(message)
  })
})
