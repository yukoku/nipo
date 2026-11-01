import { describe, expect, it } from 'vitest'

import { ConflictError, ValidationError } from '@/server/api/errors'

describe('ConflictError', () => {
  it.each([
    ['REPORT_ALREADY_EXISTS', 'この日付の日報は既に作成されています'],
    ['REPORT_LOCKED', 'コメントが付いているため、この日報は編集できません'],
    ['REPORT_NOT_DRAFT', '提出済みの日報は削除できません'],
    ['EMAIL_ALREADY_EXISTS', 'このメールアドレスは既に登録されています'],
  ] as const)('理由 %s の既定のメッセージは「%s」', (reason, message) => {
    expect(new ConflictError(reason).toBody()).toEqual({ error: { code: 'CONFLICT', reason, message } })
  })

  it('理由なしでも作れ、そのときは reason を含めない', () => {
    expect(new ConflictError(undefined, '部下がいるため、権限を変更できません').toBody()).toEqual({
      error: { code: 'CONFLICT', message: '部下がいるため、権限を変更できません' },
    })
    expect(new ConflictError().status).toBe(409)
  })
})

describe('ValidationError', () => {
  it('1 つの項目のエラーから作れる', () => {
    expect(ValidationError.forField('visit_records[0].customer_id', '有効な顧客を選択してください').toBody()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容に誤りがあります',
        details: [{ field: 'visit_records[0].customer_id', message: '有効な顧客を選択してください' }],
      },
    })
  })
})
