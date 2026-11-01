import { OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi'

type OpenApiDefinition = OpenAPIRegistry['definitions'][number]
import type { z } from 'zod'

import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { apiErrorBodySchema } from '@/schemas/api-error'
import { pageMetaSchema } from '@/schemas/pagination'

/** セキュリティスキームの名前（OpenAPI の components.securitySchemes） */
export const SECURITY = { session: 'sessionCookie', csrf: 'csrfToken' } as const

/** エラーレスポンスの説明（docs/api.md §1.5） */
const ERROR_DESCRIPTIONS = {
  400: '入力チェックエラー（`VALIDATION_ERROR`）。`details` に項目別のメッセージ',
  401: '未ログイン・セッション切れ・認証失敗（`UNAUTHENTICATED`）',
  403: '権限なし・CSRF トークンなし（`FORBIDDEN`）',
  404: '対象が存在しない、または閲覧権限がない（`NOT_FOUND`）',
  409: '一意制約違反・編集できない状態（`CONFLICT`）。理由は `reason`',
  429: 'ログイン試行回数の上限（`TOO_MANY_ATTEMPTS`）',
  500: 'サーバーエラー（`INTERNAL_ERROR`）',
} as const

export type ErrorStatus = keyof typeof ERROR_DESCRIPTIONS

export interface ApiDefinition {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  /** `/api/v1` を除いたパス。パスパラメーターは `{id}` の形で書く（例：`/reports/{id}`） */
  path: string
  /** 仕様書の API の ID（例：`R-02`）。operationId と概要の先頭に使う */
  id: string
  summary: string
  description?: string
  tag: string
  /**
   * 認証。`session`（既定）ならセッション Cookie が必要で、401 を自動で付ける。
   * 更新系（get 以外）はさらに CSRF トークンが必要で、403 を自動で付ける
   */
  auth?: 'session' | 'none'
  request?: {
    params?: z.ZodObject
    query?: z.ZodObject
    body?: z.ZodType
  }
  response: {
    status: 200 | 201 | 204
    description: string
    /** 204 では省略する */
    schema?: z.ZodType
  }
  /** この API が返しうるエラー。400（入力があるとき）・401・403（認証の条件）・500 は自動で付く */
  errors?: ErrorStatus[]
}

/**
 * どの API からも参照されていなくても components.schemas に出す共通部品。
 * 名前はスキーマの `.meta({ id })` で付ける（`registry.register()` は Zod の拡張が必要なため使わない。
 * Zod 4 では拡張より先に作られたスキーマに `.openapi()` が付かず、src/schemas/ と共有できない）
 */
export const COMMON_SCHEMAS: OpenApiDefinition[] = [
  { type: 'schema', schema: apiErrorBodySchema },
  { type: 'schema', schema: pageMetaSchema },
]

/** 共通部品（認証）を登録したレジストリを作る。エラーレスポンス・meta は COMMON_SCHEMAS */
export function createRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry()

  registry.registerComponent('securitySchemes', SECURITY.session, {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE_NAME,
    description: 'ログイン（A-01）で発行されるセッション Cookie（`HttpOnly`・`Secure`・`SameSite=Lax`）',
  })
  registry.registerComponent('securitySchemes', SECURITY.csrf, {
    type: 'apiKey',
    in: 'header',
    name: CSRF_HEADER_NAME,
    description: '更新系（POST / PUT / DELETE）で必須。値は `GET /auth/me`（A-03）の `csrf_token`',
  })

  return registry
}

/** API を 1 つ登録する。Route Handler の入力チェックに使う Zod スキーマを、そのまま `request` に渡す */
export function registerApi(registry: OpenAPIRegistry, api: ApiDefinition): void {
  const auth = api.auth ?? 'session'
  const isUpdate = api.method !== 'get'
  const hasInput = api.request?.query !== undefined || api.request?.body !== undefined || api.request?.params !== undefined

  const errorStatuses = new Set<ErrorStatus>(api.errors)
  if (hasInput) errorStatuses.add(400)
  if (auth === 'session') {
    errorStatuses.add(401)
    if (isUpdate) errorStatuses.add(403)
  }
  errorStatuses.add(500)

  const responses: RouteConfig['responses'] = {
    [api.response.status]: {
      description: api.response.description,
      ...(api.response.schema && { content: { 'application/json': { schema: api.response.schema } } }),
    },
  }
  for (const status of [...errorStatuses].sort((a, b) => a - b)) {
    responses[status] = {
      description: ERROR_DESCRIPTIONS[status],
      content: { 'application/json': { schema: apiErrorBodySchema } },
    }
  }

  registry.registerPath({
    method: api.method,
    path: api.path,
    operationId: api.id,
    summary: `${api.id} ${api.summary}`,
    ...(api.description && { description: api.description }),
    tags: [api.tag],
    security:
      auth === 'none' ? [] : [{ [SECURITY.session]: [], ...(isUpdate && { [SECURITY.csrf]: [] }) }],
    request: {
      ...(api.request?.params && { params: api.request.params }),
      ...(api.request?.query && { query: api.request.query }),
      ...(api.request?.body && {
        body: { required: true, content: { 'application/json': { schema: api.request.body } } },
      }),
    },
    responses,
  })
}
