import { parseIdParam } from '@/server/api/params'
import { ok } from '@/server/api/response'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { getStaff, updateStaff } from '@/server/services/sales-staff'
import { STAFF_FIELD_LABELS, staffUpdateRequestSchema } from '@/schemas/sales-staff'

type Context = RouteContext<'/api/v1/sales-staff/[id]'>

/** S-03 営業詳細取得（管理者のみ。docs/api.md §7）。OpenAPI の定義は src/openapi/paths/sales-staff.ts */
export const GET = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)

  const response = ok(await getStaff(auth.user, id))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** S-04 営業更新（管理者のみ） */
export const PUT = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)
  const input = await parseJsonBody(request, staffUpdateRequestSchema, { labels: STAFF_FIELD_LABELS })

  const response = ok(await updateStaff(auth.user, id, input))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
