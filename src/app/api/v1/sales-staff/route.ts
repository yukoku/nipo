import { API_BASE_PATH } from '@/lib/api-constants'
import { created, okList } from '@/server/api/response'
import { parseJsonBody, parseSearchParams } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { createStaff, listStaff } from '@/server/services/sales-staff'
import { STAFF_FIELD_LABELS, staffCreateRequestSchema, staffListQuerySchema } from '@/schemas/sales-staff'

/** S-01 営業一覧取得（docs/api.md §7）。OpenAPI の定義は src/openapi/paths/sales-staff.ts */
export const GET = withApi(async (request) => {
  const auth = await requireAuth(request)
  const query = parseSearchParams(request.nextUrl.searchParams, staffListQuerySchema, { labels: STAFF_FIELD_LABELS })

  const { items, meta } = await listStaff(auth.user, query)
  const response = okList(items, meta)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** S-02 営業登録（管理者のみ） */
export const POST = withApi(async (request) => {
  const auth = await requireAuth(request)
  const input = await parseJsonBody(request, staffCreateRequestSchema, { labels: STAFF_FIELD_LABELS })

  const staff = await createStaff(auth.user, input)
  const response = created(staff, `${API_BASE_PATH}/sales-staff/${staff.id}`)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
