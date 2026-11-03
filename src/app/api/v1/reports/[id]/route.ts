import { parseIdParam } from '@/server/api/params'
import { ok } from '@/server/api/response'
import { parseJsonBody } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { requireAuth } from '@/server/auth/require-auth'
import { refreshSessionCookie } from '@/server/auth/session'
import { getReport, updateReport } from '@/server/services/report'
import { reportUpdateRequestSchema } from '@/schemas/report'

type Context = RouteContext<'/api/v1/reports/[id]'>

/** R-03 日報詳細取得（docs/api.md §4）。OpenAPI の定義は src/openapi/paths/report.ts */
export const GET = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)

  const response = ok(await getReport(auth.user, id))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})

/** R-04 日報更新（本人のみ。docs/api.md §4） */
export const PUT = withApi(async (request, { params }: Context) => {
  const auth = await requireAuth(request)
  const id = parseIdParam((await params).id)
  const input = await parseJsonBody(request, reportUpdateRequestSchema)

  const response = ok(await updateReport(auth.user, id, input))
  refreshSessionCookie(response.cookies, request, auth)
  return response
})
