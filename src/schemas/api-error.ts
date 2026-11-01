import { z } from 'zod'

/** エラーレスポンスの `code`（docs/api.md §1.5） */
export const apiErrorCodeSchema = z
  .enum([
    'VALIDATION_ERROR',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'TOO_MANY_ATTEMPTS',
    'INTERNAL_ERROR',
  ])
  .meta({ id: 'ErrorCode', description: 'エラーの種類。HTTP ステータスと 1 対 1 に対応する' })

/** 409 の理由（docs/api.md §1.5、決定事項 #20） */
export const conflictReasonSchema = z
  .enum(['REPORT_ALREADY_EXISTS', 'REPORT_LOCKED', 'REPORT_NOT_DRAFT', 'EMAIL_ALREADY_EXISTS'])
  .meta({ id: 'ConflictReason', description: '409 のときだけ返す理由。画面はこれで表示を切り替える。理由を区別する必要がない 409 では省略' })

/** 403 の理由（決定事項 #27）。権限不足の 403 と区別するために使う */
export const forbiddenReasonSchema = z.enum(['CSRF_TOKEN_INVALID']).meta({
  id: 'ForbiddenReason',
  description:
    'CSRF トークン・Origin の確認に失敗した 403 のときだけ返す。画面の API クライアントは、トークンを取り直して 1 回だけ再送する。権限不足の 403 では省略',
})

/** 入力チェックエラーの項目別メッセージ */
export const validationErrorDetailSchema = z
  .object({
    field: z.string().meta({
      description: '項目のパス（`visit_records[0].content` の形式）。リクエスト全体のエラーは空文字',
      example: 'visit_records[0].content',
    }),
    message: z.string().meta({ example: '訪問内容は必須です' }),
  })
  .meta({ id: 'ValidationErrorDetail' })

/** エラーレスポンスの本文（docs/api.md §1.5） */
export const apiErrorBodySchema = z
  .object({
    error: z.object({
      code: apiErrorCodeSchema,
      message: z.string().meta({ description: '画面にそのまま表示できるメッセージ', example: '入力内容に誤りがあります' }),
      // 409 と、CSRF による 403 のときだけ。説明は ConflictReason・ForbiddenReason に書く
      reason: z.union([conflictReasonSchema, forbiddenReasonSchema]).optional(),
      details: z.array(validationErrorDetailSchema).optional().meta({ description: '400 のときだけ。項目別のメッセージ' }),
    }),
  })
  .meta({ id: 'ErrorResponse' })

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ConflictReason = z.infer<typeof conflictReasonSchema>
export type ForbiddenReason = z.infer<typeof forbiddenReasonSchema>
export type ValidationErrorDetail = z.infer<typeof validationErrorDetailSchema>
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
