import 'server-only'

import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { ApiError, InternalError } from '@/server/api/errors'
import { errorResponse } from '@/server/api/response'
import { toValidationError } from '@/server/api/validation'
import { logger } from '@/server/logger'

/**
 * リクエストの前処理。問題があれば `ApiError` を投げる。
 * 認証（#16）・CSRF（#17）・ロールのチェックをここに差し込む
 */
export type ApiHook = (request: NextRequest) => void | Promise<void>

export interface WithApiOptions {
  /** ハンドラーの前に、配列の順に実行する */
  before?: readonly ApiHook[]
}

/**
 * Route Handler を包み、すべての API で共通の処理を行う。
 *
 * - `before` のフックを順に実行する（認証・CSRF・ロールのチェック）
 * - `ApiError` を docs/api.md §1.5 の形式のエラーレスポンスにする
 * - Zod の検証エラー（`schema.parse()` の例外）は 400 にする
 * - 想定外の例外は 500 `INTERNAL_ERROR` にする。詳細はレスポンスに含めず、ログにだけ出す
 *
 * @example
 * // src/app/api/v1/reports/[id]/route.ts
 * export const GET = withApi(async (request, { params }: RouteContext<'/api/v1/reports/[id]'>) => {
 *   const { id } = await params
 *   return ok(await getReport(Number(id)))
 * })
 */
export function withApi<Context = unknown>(
  handler: (request: NextRequest, context: Context) => Response | Promise<Response>,
  options: WithApiOptions = {},
): (request: NextRequest, context: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      for (const hook of options.before ?? []) {
        await hook(request)
      }
      return await handler(request, context)
    } catch (error) {
      return handleError(error, request)
    }
  }
}

function handleError(error: unknown, request: NextRequest): Response {
  if (error instanceof ApiError) {
    return errorResponse(error)
  }
  if (error instanceof ZodError) {
    return errorResponse(toValidationError(error))
  }
  logger.error('API で想定外のエラーが発生しました', {
    error,
    // Cloud Logging が HTTP リクエストの情報として表示する項目名（LogEntry.httpRequest）
    httpRequest: { requestMethod: request.method, requestUrl: request.nextUrl.pathname },
  })
  return errorResponse(new InternalError())
}
