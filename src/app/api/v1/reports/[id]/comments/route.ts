import { API_BASE_PATH } from '@/lib/api-constants'
import { created } from '@/server/api/response'
import { parseIdParam } from '@/server/api/params'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { createComment } from '@/server/services/comment'
import { commentCreateRequestSchema } from '@/schemas/comment'

type Context = RouteContext<'/api/v1/reports/[id]/comments'>

/**
 * C-01 コメント投稿（日報を書いた人の直属の上長。docs/api.md §5）。OpenAPI の定義は src/openapi/paths/comment.ts。
 * `Location` ヘッダーに作成したコメントの URL（C-02・C-03 のパス）を付けて 201 を返す
 */
export const POST = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const reportId = parseIdParam((await params).id)
  const input = await parseJsonBody(request, commentCreateRequestSchema)

  const comment = await createComment(auth.user, reportId, input)
  const response = created(comment, `${API_BASE_PATH}/comments/${comment.id}`)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
