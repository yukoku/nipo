import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'

import { loginFormSchema } from './auth'

const messages = (input: unknown) => {
  const result = loginFormSchema.safeParse(input, { error: createErrorMap() })
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('loginFormSchema（SC-01）', () => {
  it('メールアドレスとパスワードがあれば通る', () => {
    expect(messages({ email: 'yamada@example.com', password: 'Passw0rd' })).toEqual([])
  })

  it('空なら各項目の必須エラー（M-02）', () => {
    expect(messages({ email: '', password: '' })).toEqual(['メールアドレスは必須です', 'パスワードは必須です'])
  })

  it('メール形式でなければエラー', () => {
    expect(messages({ email: 'yamada', password: 'x' })).toEqual(['メールアドレスの形式が正しくありません'])
  })

  it('前後の空白は取り除いてから確かめる', () => {
    expect(loginFormSchema.parse({ email: ' yamada@example.com ', password: 'x' }).email).toBe('yamada@example.com')
  })
})
