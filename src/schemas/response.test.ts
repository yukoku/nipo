import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { dataResponseSchema, listResponseSchema } from '@/schemas/response'

const itemSchema = z.object({ id: z.int() })

describe('レスポンスのスキーマ', () => {
  it('dataResponseSchema は { data } の形を受け付ける', () => {
    expect(dataResponseSchema(itemSchema).safeParse({ data: { id: 1 } }).success).toBe(true)
    expect(dataResponseSchema(itemSchema).safeParse({ id: 1 }).success).toBe(false)
  })

  it('listResponseSchema は { data: [], meta } の形を受け付け、meta がなければ不可', () => {
    const schema = listResponseSchema(itemSchema)
    const meta = { page: 1, per_page: 20, total_count: 1, total_pages: 1 }

    expect(schema.safeParse({ data: [{ id: 1 }], meta }).success).toBe(true)
    expect(schema.safeParse({ data: [{ id: 1 }] }).success).toBe(false)
  })
})
