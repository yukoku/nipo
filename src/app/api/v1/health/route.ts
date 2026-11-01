import { ok } from '@/server/api/response'
import { parseSearchParams } from '@/server/api/validation'
import { withApi } from '@/server/api/with-api'
import { checkHealth } from '@/server/services/health'
import { healthQuerySchema } from '@/schemas/health'

/** H-01 ヘルスチェック（docs/api.md §8）。認証不要。OpenAPI の定義は src/openapi/paths/health.ts */
export const GET = withApi(async (request) => {
  const query = parseSearchParams(request.nextUrl.searchParams, healthQuerySchema)
  return ok(await checkHealth(query))
})
