import { parseIdParam } from '@/server/api/params'
import { ok } from '@/server/api/response'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { getCustomer, updateCustomer } from '@/server/services/customer'
import { CUSTOMER_FIELD_LABELS, customerUpdateRequestSchema } from '@/schemas/customer'

type Context = RouteContext<'/api/v1/customers/[id]'>

/** M-03 顧客詳細取得（管理者のみ。docs/api.md §6）。OpenAPI の定義は src/openapi/paths/customer.ts */
export const GET = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)

  const response = ok(await getCustomer(auth.user, id))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** M-04 顧客更新（管理者のみ） */
export const PUT = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)
  const input = await parseJsonBody(request, customerUpdateRequestSchema, { labels: CUSTOMER_FIELD_LABELS })

  const response = ok(await updateCustomer(auth.user, id, input))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
