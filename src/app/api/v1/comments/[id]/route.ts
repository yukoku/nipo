import { noContent, ok } from '@/server/api/response'
import { parseIdParam } from '@/server/api/params'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { deleteComment, updateComment } from '@/server/services/comment'
import { commentUpdateRequestSchema } from '@/schemas/comment'

type Context = RouteContext<'/api/v1/comments/[id]'>

/** C-02 コメント更新（投稿した本人だけ。docs/api.md §5）。OpenAPI の定義は src/openapi/paths/comment.ts */
export const PUT = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)
  const input = await parseJsonBody(request, commentUpdateRequestSchema)

  const response = ok(await updateComment(auth.user, id, input))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** C-03 コメント削除（投稿した本人だけ。物理削除） */
export const DELETE = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)

  await deleteComment(auth.user, id)
  const response = noContent()
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
