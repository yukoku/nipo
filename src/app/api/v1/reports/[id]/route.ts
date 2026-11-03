import { parseIdParam } from '@/server/api/params'
import { ok } from '@/server/api/response'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { getReport } from '@/server/services/report'

type Context = RouteContext<'/api/v1/reports/[id]'>

/** R-03 日報詳細取得（docs/api.md §4）。OpenAPI の定義は src/openapi/paths/report.ts */
export const GET = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)

  const response = ok(await getReport(auth.user, id))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
