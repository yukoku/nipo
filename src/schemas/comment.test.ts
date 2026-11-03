import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'
import { COMMENT_LIMITS, commentCreateRequestSchema, commentUpdateRequestSchema } from '@/schemas/comment'

const errorMap = { error: createErrorMap() }
const parseCreate = (input: unknown) => commentCreateRequestSchema.safeParse(input, errorMap)
const parseUpdate = (input: unknown) => commentUpdateRequestSchema.safeParse(input, errorMap)

/** エラーを `{ 項目名: メッセージ }` にする */
function errorsOf(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))
}

describe('commentCreateRequestSchema（C-01）', () => {
  it.each(['problem', 'plan'])('target=%s を受け付け、本文の前後の空白を除く', (target) => {
    const result = parseCreate({ target, body: '  5%までなら即決OK  ' })
    expect(result.data).toEqual({ target, body: '5%までなら即決OK' })
  })

  it('T-CMT-08: target が problem・plan 以外なら、target のエラー', () => {
    expect(errorsOf(parseCreate({ target: 'other', body: 'OK' }))).toHaveProperty('target')
  })

  it('target・body がなければ、それぞれ必須のエラー', () => {
    expect(errorsOf(parseCreate({}))).toEqual({ target: 'コメント対象は必須です', body: 'コメントは必須です' })
  })

  it.each(['', '   ', '\n\t'])('T-CMT-09: 本文が空・空白だけ（%j）なら必須のエラー', (body) => {
    expect(errorsOf(parseCreate({ target: 'problem', body }))).toEqual({ body: 'コメントは必須です' })
  })

  it('T-CMT-10: 本文は 1,000 文字まで。1,001 文字はエラー', () => {
    expect(parseCreate({ target: 'plan', body: 'あ'.repeat(COMMENT_LIMITS.body) }).success).toBe(true)
    expect(errorsOf(parseCreate({ target: 'plan', body: 'あ'.repeat(COMMENT_LIMITS.body + 1) }))).toEqual({
      body: 'コメントは1000文字以内で入力してください',
    })
  })
})

describe('commentUpdateRequestSchema（C-02）', () => {
  it('T-CMT-13: target が送られても取り除く（変えられない）', () => {
    expect(parseUpdate({ target: 'plan', body: '修正後' }).data).toEqual({ body: '修正後' })
  })

  it('本文が空白だけならエラー', () => {
    expect(errorsOf(parseUpdate({ body: ' ' }))).toEqual({ body: 'コメントは必須です' })
  })
})
