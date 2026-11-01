import { describe, expect, it, vi } from 'vitest'

import { ApiClientError } from './api-client'
import { ROOT_ERROR_KEY, apiErrorMessage, apiFieldToFormPath, applyApiErrors } from './form-errors'
import { ERROR_MESSAGES } from './messages'

const validationError = (details: { field: string; message: string }[]) =>
  new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, details)

describe('apiFieldToFormPath', () => {
  it('配列の添字を react-hook-form の形にする', () => {
    expect(apiFieldToFormPath('visit_records[1].content')).toBe('visit_records.1.content')
    expect(apiFieldToFormPath('problem')).toBe('problem')
  })
})

describe('applyApiErrors', () => {
  it('400 の details を、各項目のエラーとして設定する（最初の項目にだけフォーカス）', () => {
    const setError = vi.fn()
    const error = validationError([
      { field: 'problem', message: 'Problemは必須です' },
      { field: 'visit_records[1].content', message: '訪問内容は必須です' },
    ])

    expect(applyApiErrors(error, setError)).toBe(true)
    expect(setError.mock.calls).toEqual([
      ['problem', { type: 'server', message: 'Problemは必須です' }, { shouldFocus: true }],
      ['visit_records.1.content', { type: 'server', message: '訪問内容は必須です' }, { shouldFocus: false }],
    ])
  })

  it('項目名が違う場合は fieldMap で対応づける', () => {
    const setError = vi.fn()

    applyApiErrors(validationError([{ field: 'assigned_sales_id', message: 'x' }]), setError, {
      fieldMap: { assigned_sales_id: 'assigned_sales' },
    })

    expect(setError).toHaveBeenCalledWith('assigned_sales', expect.anything(), expect.anything())
  })

  it('項目に結び付けられないエラー（field が空・フォームにない項目）は、フォーム全体のエラーにまとめる', () => {
    const setError = vi.fn()
    const error = validationError([
      { field: '', message: 'リクエストの本文が JSON ではありません' },
      { field: 'unknown_field', message: '不明な項目' },
      { field: 'visit_records[0].content', message: '訪問内容は必須です' },
    ])

    applyApiErrors(error, setError, { fields: ['visit_records', 'problem'] })

    expect(setError).toHaveBeenCalledWith('visit_records.0.content', expect.anything(), { shouldFocus: true })
    expect(setError).toHaveBeenCalledWith(ROOT_ERROR_KEY, {
      type: 'server',
      message: 'リクエストの本文が JSON ではありません\n不明な項目',
    })
  })

  it('details が空なら、エラーの message をフォーム全体のエラーにする', () => {
    const setError = vi.fn()

    applyApiErrors(validationError([]), setError)

    expect(setError).toHaveBeenCalledWith(ROOT_ERROR_KEY, { type: 'server', message: '入力内容に誤りがあります' })
  })

  it('400 以外のエラーは何もせず false を返す', () => {
    const setError = vi.fn()

    expect(applyApiErrors(new ApiClientError(409, 'CONFLICT', '既にあります', 'REPORT_ALREADY_EXISTS'), setError)).toBe(false)
    expect(applyApiErrors(new Error('x'), setError)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })
})

describe('apiErrorMessage', () => {
  it('API のエラーはその message、500 以上は既定の文言', () => {
    expect(apiErrorMessage(new ApiClientError(409, 'CONFLICT', 'この日付の日報は既に作成されています'))).toBe(
      'この日付の日報は既に作成されています',
    )
    expect(apiErrorMessage(new ApiClientError(500, 'INTERNAL_ERROR', 'サーバーエラー'))).toBe(ERROR_MESSAGES.unexpected)
  })

  it('通信エラー（fetch の TypeError）とそれ以外', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(ERROR_MESSAGES.network)
    expect(apiErrorMessage('x')).toBe(ERROR_MESSAGES.unexpected)
  })
})
