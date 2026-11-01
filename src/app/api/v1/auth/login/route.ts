import { ok } from '@/server/api/response'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { verifyOrigin } from '@/server/auth/csrf'
import { createSession, setSessionCookie } from '@/server/auth/session'
import { authenticate, getCurrentUserProfile } from '@/server/services/auth'
import { loginRequestSchema } from '@/schemas/auth'

/** A-01 ログイン（docs/api.md §3）。認証不要。OpenAPI の定義は src/openapi/paths/auth.ts */
export const POST = withApi(async (request) => {
  // セッションがまだないので CSRF トークンは確かめられない。別のサイトからのログインを Origin で防ぐ
  verifyOrigin(request)
  const { email, password } = await parseJsonBody(request, loginRequestSchema)

  const staffId = await authenticate(email, password)
  const session = await createSession(staffId)

  const response = ok(await getCurrentUserProfile(staffId, session.csrfToken))
  setSessionCookie(response.cookies, session.token, session.expiresAt)
  return response
})
