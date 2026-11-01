import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { noContent } from '@/server/api/response'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { clearSessionCookie, deleteSession } from '@/server/auth/session'

/** A-02 ログアウト（docs/api.md §3）。OpenAPI の定義は src/openapi/paths/auth.ts */
export const POST = withApi(async (request) => {
  await requireAuth(request)
  await deleteSession(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  const response = noContent()
  clearSessionCookie(response.cookies)
  return response
})
