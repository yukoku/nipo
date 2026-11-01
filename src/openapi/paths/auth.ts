import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { currentUserSchema, loginRequestSchema } from '@/schemas/auth'
import { dataResponseSchema } from '@/schemas/response'

/** 認証 API（docs/api.md §3）。Route Handler：src/app/api/v1/auth/{login,logout,me}/route.ts */
export function registerAuthApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'post',
    path: '/auth/login',
    id: 'A-01',
    summary: 'ログイン',
    description:
      'メールアドレスとパスワードで認証し、セッション Cookie（`nipo_session`）を発行する。認証不要。メールアドレスの違い・パスワードの違い・無効なアカウントは、すべて同じ 401 を返す。別のサイトの Origin からのリクエストは 403',
    tag: '認証',
    auth: 'none',
    request: { body: loginRequestSchema },
    // 429（ログイン試行回数の上限）は #43 で追加する
    errors: [401, 403],
    response: { status: 200, description: 'ログインした。A-03 と同じ形式のユーザー情報を返す', schema: dataResponseSchema(currentUserSchema) },
  })

  registerApi(registry, {
    method: 'post',
    path: '/auth/logout',
    id: 'A-02',
    summary: 'ログアウト',
    description: 'セッションを破棄し、セッション Cookie を消す',
    tag: '認証',
    response: { status: 204, description: 'ログアウトした' },
  })

  registerApi(registry, {
    method: 'get',
    path: '/auth/me',
    id: 'A-03',
    summary: 'ログインユーザー情報取得',
    description: 'ログイン中のユーザーの情報と、更新系 API で使う CSRF トークンを返す',
    tag: '認証',
    response: { status: 200, description: 'ログイン中のユーザー', schema: dataResponseSchema(currentUserSchema) },
  })
}
