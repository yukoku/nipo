import { z } from 'zod'

/**
 * コメントのスキーマ（docs/api.md §5 C-01・C-02）。
 * API の入力チェックと、日報詳細画面（SC-04）のコメント欄の入力チェックで同じものを使う。
 * レスポンスのコメントオブジェクトは `commentSchema`（`@/schemas/report`。日報オブジェクトの `comments[]` と同じ形）
 */

/** コメントの項目の上限（docs/api.md C-01、docs/screens.md SC-04） */
export const COMMENT_LIMITS = {
  /** 本文の最大文字数 */
  body: 1000,
} as const

/** コメントの対象（API の値） */
export const commentTargetSchema = z
  .enum(['problem', 'plan'])
  .meta({ id: 'CommentTarget', description: '`problem`（Problem へのコメント）/ `plan`（Plan へのコメント）' })

/** コメントの本文。前後の空白を除いて 1〜1,000 文字（空白だけは不可。T-CMT-09・10） */
const commentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(COMMENT_LIMITS.body)
  .meta({
    description: 'コメント本文（1,000 文字以内。空白だけは不可）',
    example: '5%までなら即決OK。それ以上は相談して。',
  })

/** C-01 コメント投稿のリクエスト */
export const commentCreateRequestSchema = z.object({
  target: commentTargetSchema,
  body: commentBodySchema,
})

/** C-02 コメント更新のリクエスト。`target` は変えられない（送られても無視する。T-CMT-13） */
export const commentUpdateRequestSchema = z.object({
  body: commentBodySchema,
})

export type CommentTarget = z.output<typeof commentTargetSchema>
export type CommentCreateRequest = z.output<typeof commentCreateRequestSchema>
export type CommentUpdateRequest = z.output<typeof commentUpdateRequestSchema>
