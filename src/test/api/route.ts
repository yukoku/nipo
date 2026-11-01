import { NextRequest } from 'next/server'

/** Route Handler（`export const GET = withApi(...)` など）の型 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- context の型は API ごとに違うため、any で受ける
type RouteHandler = (request: NextRequest, context: any) => Response | Promise<Response>

export interface CallRouteOptions {
  /** HTTP メソッド。省略時は GET */
  method?: string
  /** クエリパラメータ。`undefined` の項目は付けない */
  query?: Record<string, string | number | boolean | undefined>
  /** リクエストの本文。JSON にして送り、`Content-Type: application/json` を付ける */
  body?: unknown
  /** JSON にせずそのまま送る本文（不正な JSON を送るテスト用）。`body` より優先する */
  rawBody?: string
  /** 追加のリクエストヘッダー（#17 の `X-CSRF-Token` など） */
  headers?: Record<string, string>
  /** 動的なパスのパラメータ（`/reports/[id]` の `{ id: '101' }` など） */
  params?: Record<string, string | string[]>
}

export interface RouteResult<Body = unknown> {
  status: number
  headers: Headers
  /** レスポンスの本文。JSON なら解析した値、本文がない（204 など）なら `null` */
  body: Body
}

/**
 * Route Handler を、HTTP サーバーを立てずに直接呼び出す（APIテスト用）。
 *
 * ログイン状態（セッション Cookie と CSRF トークン）の付与は、認証 API（#18）で追加する。
 *
 * @example
 * import { GET } from '@/app/api/v1/health/route'
 *
 * const response = await callRoute(GET, '/api/v1/health', { query: { check: 'db' } })
 * expect(response.status).toBe(200)
 * expect(response.body).toEqual({ data: { status: 'ok', checks: { db: 'ok' } } })
 */
export async function callRoute<Body = unknown>(
  handler: RouteHandler,
  path: string,
  options: CallRouteOptions = {},
): Promise<RouteResult<Body>> {
  const url = new URL(path, 'http://localhost')
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers = new Headers(options.headers)
  let body: string | undefined
  if (options.rawBody !== undefined) {
    body = options.rawBody
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  }

  const request = new NextRequest(url, { method: options.method ?? 'GET', headers, body })
  // Next.js 16 の Route Handler は、params を Promise で受け取る
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) })

  const text = await response.text()
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  return {
    status: response.status,
    headers: response.headers,
    body: (text === '' ? null : isJson ? JSON.parse(text) : text) as Body,
  }
}
