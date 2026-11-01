import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createErrorMap } from '@/lib/validation/error-map'
import { PASSWORD_CHARACTER_MESSAGE, PASSWORD_MAX_LENGTH, passwordSchema } from '@/schemas/password'

/** API と同じく `password` 項目として検証し、エラーメッセージの一覧を返す */
function messages(password: unknown): string[] {
  const result = z.object({ password: passwordSchema }).safeParse({ password }, { error: createErrorMap() })
  return result.error?.issues.map((issue) => issue.message) ?? []
}

describe('passwordSchema（U-07）', () => {
  it('U-07: 7 文字はエラーになる', () => {
    expect(messages('Passw0r')).toEqual(['パスワードは8文字以上で入力してください'])
  })

  it('U-07: 8 文字（英数混在）は通る', () => {
    expect(messages('Passw0rd')).toEqual([])
  })

  it('U-07: 英字のみはエラーになる', () => {
    expect(messages('password')).toEqual([PASSWORD_CHARACTER_MESSAGE])
  })

  it('U-07: 数字のみはエラーになる', () => {
    expect(messages('12345678')).toEqual([PASSWORD_CHARACTER_MESSAGE])
  })

  it('U-07: 英数混在は通る（大文字・小文字・記号・空白があってもよい）', () => {
    expect(messages('abcd1234')).toEqual([])
    expect(messages('ABCD1234')).toEqual([])
    expect(messages('pass word 1!')).toEqual([])
  })

  it('T-STF-03 の前提："Pass0"・"password"・"12345678" はエラー、"Passw0rd" は通る', () => {
    expect(messages('Pass0')).not.toEqual([])
    expect(messages('password')).not.toEqual([])
    expect(messages('12345678')).not.toEqual([])
    expect(messages('Passw0rd')).toEqual([])
  })

  it('全角の英字・数字は英字・数字として数えない', () => {
    expect(messages('ｐａｓｓｗｏｒｄ１２')).toEqual([PASSWORD_CHARACTER_MESSAGE, PASSWORD_CHARACTER_MESSAGE])
  })

  it('128 文字までは通り、129 文字はエラーになる', () => {
    const base = 'a1'.repeat(PASSWORD_MAX_LENGTH / 2)
    expect(messages(base)).toEqual([])
    expect(messages(`${base}x`)).toEqual(['パスワードは128文字以内で入力してください'])
  })

  it('空・未指定は必須エラーになる', () => {
    expect(messages(undefined)).toEqual(['パスワードは必須です'])
    expect(messages('')[0]).toBe('パスワードは8文字以上で入力してください')
  })
})
