/**
 * 画面に出すメッセージ（docs/screens.md §5 のメッセージ一覧）。画面に文言を直接書かず、ここから使う
 *
 * M-02・M-03（入力チェック）は `@/lib/validation/error-map` で作る
 */

/** 完了メッセージ（M-09）。トーストで出す（`notifySuccess()`、`@/lib/notify`） */
export const SUCCESS_MESSAGES = {
  saved: '保存しました',
  submitted: '提出しました',
  commented: 'コメントを投稿しました',
} as const

export type SuccessKind = keyof typeof SUCCESS_MESSAGES

/** 確認ダイアログの内容 */
export interface ConfirmOptions {
  title: string
  description?: string
  /** 実行するボタンの文言 */
  confirmLabel: string
  /** やめるボタンの文言 */
  cancelLabel?: string
  /** 削除など、取り消せない操作なら true（ボタンを赤くする） */
  destructive?: boolean
}

/** 確認ダイアログ（M-06〜M-08・M-11・M-12）。`useConfirm()`（`@/components/confirm-dialog`）に渡す */
export const CONFIRM_MESSAGES = {
  /** M-06 */
  submitReport: { title: '日報を提出します。よろしいですか？', confirmLabel: '提出する' },
  /** M-07 */
  leaveUnsaved: {
    title: '入力内容が保存されていません。移動してよろしいですか？',
    description: '移動すると、入力した内容は失われます。',
    confirmLabel: '移動する',
    cancelLabel: '入力を続ける',
    destructive: true,
  },
  /** M-08 */
  deleteComment: { title: 'コメントを削除します。よろしいですか？', confirmLabel: '削除する', destructive: true },
  /** M-11 */
  deactivateManager: {
    title: 'この上長には部下が設定されています。無効にしてよろしいですか？',
    description: '部下の上長の設定は残ります。必要に応じて付け替えてください。',
    confirmLabel: '無効にする',
    destructive: true,
  },
  /** M-12 */
  deleteDraft: { title: 'この下書きを削除します。よろしいですか？', confirmLabel: '削除する', destructive: true },
} as const satisfies Record<string, ConfirmOptions>

/** API のエラーで、項目に結び付けられないものの既定の文言 */
export const ERROR_MESSAGES = {
  unexpected: 'エラーが発生しました。時間をおいて再度お試しください',
  network: '通信できませんでした。ネットワークの接続を確認してください',
  logoutFailed: 'ログアウトできませんでした。時間をおいて再度お試しください',
} as const
