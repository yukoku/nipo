import { toast } from 'sonner'

import { ERROR_MESSAGES, SUCCESS_MESSAGES, type SuccessKind } from './messages'

/**
 * トーストでメッセージを出す（Client Component から呼ぶ）。
 * トーストの表示場所（`<Toaster />`）はルートのレイアウトにあるため、どの画面からでも出せ、画面を移動しても消えない
 *
 * @example
 * notifySuccess('submitted')   // 「提出しました」（M-09）
 * router.push(`/reports/${id}`)
 */
export function notifySuccess(kind: SuccessKind): void {
  toast.success(SUCCESS_MESSAGES[kind])
}

/** エラーをトーストで出す。項目に結び付けられないエラー（409・500 など）に使う */
export function notifyError(message: string = ERROR_MESSAGES.unexpected): void {
  toast.error(message)
}
