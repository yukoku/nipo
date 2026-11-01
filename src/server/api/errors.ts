import 'server-only'

import type {
  ApiErrorBody,
  ApiErrorCode,
  ConflictReason,
  ForbiddenReason,
  ValidationErrorDetail,
} from '@/schemas/api-error'

// 型の定義元は Zod スキーマ（`@/schemas/api-error`。OpenAPI の ErrorResponse と同じ）
export type { ApiErrorBody, ApiErrorCode, ConflictReason, ForbiddenReason, ValidationErrorDetail }

/**
 * API で返すエラーの基底クラス。services などで throw すると、`withApi()` がエラーレスポンスに変換する。
 * それ以外の例外は 500 `INTERNAL_ERROR` になる
 */
export abstract class ApiError extends Error {
  abstract readonly status: number
  abstract readonly code: ApiErrorCode

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } }
  }
}

/** 400：入力チェックエラー */
export class ValidationError extends ApiError {
  readonly status = 400
  readonly code = 'VALIDATION_ERROR'

  constructor(
    readonly details: ValidationErrorDetail[] = [],
    message = '入力内容に誤りがあります',
  ) {
    super(message)
    this.name = 'ValidationError'
  }

  /** 1 つの項目のエラーから作る（DB を見て分かるエラー。例：無効な顧客を指定した） */
  static forField(field: string, message: string): ValidationError {
    return new ValidationError([{ field, message }])
  }

  override toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } }
  }
}

/** 401：未ログイン・セッション切れ・認証失敗 */
export class UnauthenticatedError extends ApiError {
  readonly status = 401
  readonly code = 'UNAUTHENTICATED'

  constructor(message = 'ログインしてください') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

/** 403：権限なし */
export class ForbiddenError extends ApiError {
  readonly status = 403
  readonly code = 'FORBIDDEN'

  /**
   * @param message 画面に表示するメッセージ
   * @param reason 理由。CSRF トークン・Origin の確認に失敗したときだけ `CSRF_TOKEN_INVALID` を付ける（決定事項 #27）
   */
  constructor(
    message = 'この操作を行う権限がありません',
    readonly reason?: ForbiddenReason,
  ) {
    super(message)
    this.name = 'ForbiddenError'
  }

  override toBody(): ApiErrorBody {
    return this.reason === undefined
      ? super.toBody()
      : { error: { code: this.code, reason: this.reason, message: this.message } }
  }
}

/** 404：対象が存在しない（閲覧権限のない日報も、存在を推測させないよう 404 にする） */
export class NotFoundError extends ApiError {
  readonly status = 404
  readonly code = 'NOT_FOUND'

  constructor(message = '対象が見つかりません') {
    super(message)
    this.name = 'NotFoundError'
  }
}

const CONFLICT_MESSAGES: Record<ConflictReason, string> = {
  // M-04
  REPORT_ALREADY_EXISTS: 'この日付の日報は既に作成されています',
  REPORT_LOCKED: 'コメントが付いているため、この日報は編集できません',
  REPORT_NOT_DRAFT: '提出済みの日報は削除できません',
  // M-10
  EMAIL_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
}

/** 409：一意制約違反・編集できない状態 */
export class ConflictError extends ApiError {
  readonly status = 409
  readonly code = 'CONFLICT'

  /**
   * @param reason 理由。レスポンスの `reason` に入り、画面はこれで処理を分ける
   * @param message 省略すると理由ごとの既定のメッセージになる
   */
  constructor(
    readonly reason?: ConflictReason,
    message?: string,
  ) {
    super(message ?? (reason ? CONFLICT_MESSAGES[reason] : '他のデータと競合しているため、処理できません'))
    this.name = 'ConflictError'
  }

  override toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.reason && { reason: this.reason }) } }
  }
}

/** 429：ログイン試行回数の上限（A-01、決定事項 #18） */
export class TooManyAttemptsError extends ApiError {
  readonly status = 429
  readonly code = 'TOO_MANY_ATTEMPTS'

  // M-13
  constructor(message = 'ログインに続けて失敗したため、しばらくログインできません。15分ほど待ってから再度お試しください') {
    super(message)
    this.name = 'TooManyAttemptsError'
  }
}

/** 500：想定外のエラー。詳細はレスポンスに含めず、ログにだけ出す */
export class InternalError extends ApiError {
  readonly status = 500
  readonly code = 'INTERNAL_ERROR'

  constructor(message = 'サーバーでエラーが発生しました。しばらくしてから再度お試しください') {
    super(message)
    this.name = 'InternalError'
  }
}
