import { ok } from '@/server/api/response'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { getCurrentUserProfile } from '@/server/services/auth'

/** A-03 ログインユーザー情報取得（docs/api.md §3）。OpenAPI の定義は src/openapi/paths/auth.ts */
export const GET = withApi(async (request) => {
  const auth = await requireAuth(request)

  const response = ok(await getCurrentUserProfile(auth.user.id, auth.session.csrfToken))
  // 画面は起動時にこの API を呼ぶので、ここで Cookie の有効期限も延ばす（決定事項 #26）
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
