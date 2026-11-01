import { describe, expect, it } from 'vitest'

import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  TooManyAttemptsError,
  UnauthenticatedError,
  ValidationError,
} from '@/server/api/errors'
import { apiErrorBodySchema } from '@/schemas/api-error'

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

describe('エラーレスポンスの本文', () => {
  it.each([
    ['ValidationError', new ValidationError([{ field: 'visit_records[1].content', message: '訪問内容は必須です' }])],
    ['UnauthenticatedError', new UnauthenticatedError()],
    ['ForbiddenError', new ForbiddenError()],
    ['NotFoundError', new NotFoundError()],
    ['ConflictError', new ConflictError('REPORT_LOCKED')],
    ['TooManyAttemptsError', new TooManyAttemptsError()],
    ['InternalError', new InternalError()],
  ])('%s の本文は OpenAPI の ErrorResponse（apiErrorBodySchema）と一致する', (_name, error) => {
    expect(apiErrorBodySchema.strict().safeParse(error.toBody()).success).toBe(true)
  })
})
