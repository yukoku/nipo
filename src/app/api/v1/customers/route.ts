import { API_BASE_PATH } from '@/lib/api-constants'
import { created, okList } from '@/server/api/response'
import { parseJsonBody, parseSearchParams } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { createCustomer, listCustomers } from '@/server/services/customer'
import { CUSTOMER_FIELD_LABELS, customerCreateRequestSchema, customerListQuerySchema } from '@/schemas/customer'

/** M-01 顧客一覧取得（docs/api.md §6）。OpenAPI の定義は src/openapi/paths/customer.ts */
export const GET = withApi(async (request) => {
  const auth = await requireAuth(request)
  const query = parseSearchParams(request.nextUrl.searchParams, customerListQuerySchema, {
    labels: CUSTOMER_FIELD_LABELS,
  })

  const { items, meta } = await listCustomers(auth.user, query)
  const response = okList(items, meta)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** M-02 顧客登録（管理者のみ） */
export const POST = withApi(async (request) => {
  const auth = await requireAuth(request)
  const input = await parseJsonBody(request, customerCreateRequestSchema, { labels: CUSTOMER_FIELD_LABELS })

  const customer = await createCustomer(auth.user, input)
  const response = created(customer, `${API_BASE_PATH}/customers/${customer.id}`)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
