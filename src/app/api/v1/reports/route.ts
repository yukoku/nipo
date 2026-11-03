import { okList } from '@/server/api/response'
import { parseSearchParams } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { listReports } from '@/server/services/report'
import { reportListQuerySchema } from '@/schemas/report'

/** R-01 日報一覧取得（docs/api.md §4）。OpenAPI の定義は src/openapi/paths/report.ts */
export const GET = withApi(async (request) => {
  const auth = await requireAuth(request)
  const query = parseSearchParams(request.nextUrl.searchParams, reportListQuerySchema)

  const { items, meta } = await listReports(auth.user, query)
  const response = okList(items, meta)
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
