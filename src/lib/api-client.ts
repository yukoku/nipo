/**
 * 画面（Client Component）から REST API（/api/v1）を呼ぶためのクライアント。
 *
 * 更新系のリクエスト（POST・PUT・PATCH・DELETE）には、CSRF トークン（`X-CSRF-Token`）を自動で付ける（#17）。
 * 画面を作る人がトークンを意識する必要はない。
 *
 * - トークンは `GET /api/v1/auth/me` から取得し、使い回す（ログイン API のレスポンスで受け取った場合は `setCsrfToken()` で入れる）
 * - トークンが古くて 403（`reason: CSRF_TOKEN_INVALID`）が返ったら、取り直して 1 回だけ再送する
 *
 * @example
 * const { data } = await api.post<{ data: Report }>('/reports', { report_date: '2026-10-31', ... })
 */
import type { ApiErrorBody, ValidationErrorDetail } from '@/schemas/api-error'

import { API_BASE_PATH, CSRF_HEADER_NAME } from './api-constants'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** API がエラー（4xx・5xx）を返したときに投げる */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly reason?: string,
    readonly details: ValidationErrorDetail[] = [],
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export interface ApiRequestOptions {
  /** リクエストの本文。JSON にして送る */
  body?: unknown
  /** クエリパラメータ。`undefined` の項目は付けない */
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

let csrfToken: string | null = null
let csrfTokenRequest: Promise<string> | null = null

/** CSRF トークンを入れる（ログイン API のレスポンスで受け取ったとき）。`null` で消す（ログアウトしたとき） */
export function setCsrfToken(token: string | null): void {
  csrfToken = token
  csrfTokenRequest = null
}

/**
 * API を呼ぶ。成功したらレスポンスの本文（JSON）を返す。本文がない（204）なら `null`。
 * エラーなら `ApiClientError` を投げる
 *
 * @param path `/api/v1` より後ろのパス（例：`/reports`、`/reports/101`）
 */
export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const upperMethod = method.toUpperCase()
  if (!UNSAFE_METHODS.has(upperMethod)) {
    return parseResponse<T>(await send(upperMethod, path, options, null))
  }

  const response = await send(upperMethod, path, options, await getCsrfToken())
  if (response.status === 403 && (await isCsrfError(response))) {
    // トークンが古い（別のタブでログインし直した、など）。取り直して 1 回だけ再送する
    setCsrfToken(null)
    return parseResponse<T>(await send(upperMethod, path, options, await getCsrfToken()))
  }
  return parseResponse<T>(response)
}

/** よく使うメソッドの省略形 */
export const api = {
  get: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, 'body'>) => apiRequest<T>('GET', path, options),
  post: <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>('POST', path, { ...options, body }),
  put: <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>('PUT', path, { ...options, body }),
  delete: <T = unknown>(path: string, options?: ApiRequestOptions) => apiRequest<T>('DELETE', path, options),
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

function send(method: string, path: string, options: ApiRequestOptions, token: string | null): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' })
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (token !== null) headers.set(CSRF_HEADER_NAME, token)

  return fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    signal: options.signal,
  })
}

function buildUrl(path: string, query: ApiRequestOptions['query']): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, String(value))
  }
  const queryString = search.toString()
  return `${API_BASE_PATH}${path}${queryString === '' ? '' : `?${queryString}`}`
}

/** CSRF トークンを返す。持っていなければ `GET /auth/me` から取得する（同時に呼ばれても取得は 1 回） */
function getCsrfToken(): Promise<string> {
  if (csrfToken !== null) {
    return Promise.resolve(csrfToken)
  }
  csrfTokenRequest ??= (async () => {
    try {
      const body = await parseResponse<{ data: { csrf_token: string } }>(await send('GET', '/auth/me', {}, null))
      csrfToken = body.data.csrf_token
      return csrfToken
    } finally {
      csrfTokenRequest = null
    }
  })()
  return csrfTokenRequest
}

/** CSRF の確認に失敗した 403 か（本文を読むため、元のレスポンスは複製して調べる） */
async function isCsrfError(response: Response): Promise<boolean> {
  const body = await readJson(response.clone())
  return isApiErrorBody(body) && body.error.reason === 'CSRF_TOKEN_INVALID'
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await readJson(response)
  if (response.ok) {
    return body as T
  }
  if (isApiErrorBody(body)) {
    const { code, message, reason, details } = body.error
    throw new ApiClientError(response.status, code, message, reason, details)
  }
  throw new ApiClientError(response.status, 'UNKNOWN', `通信エラーが発生しました（${response.status}）`)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'object' &&
    (body as { error: object | null }).error !== null
  )
}
