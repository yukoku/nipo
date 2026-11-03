import { API_BASE_PATH } from '@/lib/api-constants'
import { created, okList } from '@/server/api/response'
import { parseJsonBody, parseSearchParams } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { createReport, listReports } from '@/server/services/report'
import { reportCreateRequestSchema, reportListQuerySchema } from '@/schemas/report'

/** R-01 日報一覧取得（docs/api.md §4）。OpenAPI の定義は src/openapi/paths/report.ts */
export const GET = withApi(async (request) => {
  const auth = await requireAuth(request)
  const query = parseSearchParams(request.nextUrl.searchParams, reportListQuerySchema)

  const { items, meta } = await listReports(auth.user, query)
  const response = okList(items, meta)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** R-02 日報作成（営業・上長）。`Location` ヘッダーに作成した日報の URL を付けて 201 を返す */
export const POST = withApi(async (request) => {
  const auth = await requireAuth(request)
  const input = await parseJsonBody(request, reportCreateRequestSchema)

  const report = await createReport(auth.user, input)
  const response = created(report, `${API_BASE_PATH}/reports/${report.id}`)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
