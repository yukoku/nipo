import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { ApiClientError } from './api-client'
import { ERROR_MESSAGES } from './messages'

/**
 * API のエラーを、フォーム（react-hook-form）のエラーとして表示するための関数
 */

/** フォーム全体のエラー（項目に結び付けられないもの）を入れる場所。`<FormRootError />` で表示する */
export const ROOT_ERROR_KEY = 'root.server'

/**
 * API の `details[].field`（`visit_records[0].content`）を、react-hook-form の項目名（`visit_records.0.content`）にする。
 * フォームは API と同じ snake_case のキーの Zod スキーマを使うため、キーの名前は変えない
 */
export function apiFieldToFormPath(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1')
}

export interface ApplyApiErrorOptions {
  /** API の項目名とフォームの項目名が違う場合の対応（API の項目名 → フォームの項目名） */
  fieldMap?: Record<string, string>
  /** フォームにある項目名。ここにない項目のエラーは、フォーム全体のエラーとして出す（省略時はすべて項目に出す） */
  fields?: readonly string[]
}

/**
 * API の 400 エラー（`VALIDATION_ERROR`）の `details` を、フォームの各項目のエラーとして設定する。
 * 設定したら `true`。400 以外のエラー（409・500・通信エラーなど）は何もせず `false` を返すので、呼び出し側でトーストなどを出す
 *
 * @example
 * try {
 *   await api.post('/customers', values)
 * } catch (error) {
 *   if (!applyApiErrors(error, form.setError)) notifyError(apiErrorMessage(error))
 * }
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: ApplyApiErrorOptions = {},
): boolean {
  if (!(error instanceof ApiClientError) || error.code !== 'VALIDATION_ERROR') {
    return false
  }
  const rootMessages: string[] = []
  let focused = false
  for (const detail of error.details) {
    const path = options.fieldMap?.[detail.field] ?? apiFieldToFormPath(detail.field)
    if (path === '' || (options.fields !== undefined && !isKnownField(path, options.fields))) {
      rootMessages.push(detail.message)
      continue
    }
    // 最初のエラーの項目にフォーカスを移す（どこが間違っているか分かるように）
    setError(path as Path<T>, { type: 'server', message: detail.message }, { shouldFocus: !focused })
    focused = true
  }
  if (rootMessages.length > 0 || error.details.length === 0) {
    setError(ROOT_ERROR_KEY as Path<T>, { type: 'server', message: rootMessages.join('\n') || error.message })
  }
  return true
}

/** フォームの項目（`visit_records` なら `visit_records.0.content` も含む）か */
function isKnownField(path: string, fields: readonly string[]): boolean {
  return fields.some((field) => path === field || path.startsWith(`${field}.`))
}

/** エラーをトーストなどで出すときの文言。API のエラーならその `message`、それ以外は既定の文言 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status >= 500 ? ERROR_MESSAGES.unexpected : error.message
  }
  if (error instanceof TypeError) {
    // fetch が通信に失敗したときは TypeError になる
    return ERROR_MESSAGES.network
  }
  return ERROR_MESSAGES.unexpected
}
