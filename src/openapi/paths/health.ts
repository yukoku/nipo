import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { healthQuerySchema, healthSchema } from '@/schemas/health'
import { dataResponseSchema } from '@/schemas/response'

/** ヘルスチェック API（docs/api.md §8）。Route Handler：src/app/api/v1/health/route.ts */
export function registerHealthApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'get',
    path: '/health',
    id: 'H-01',
    summary: 'ヘルスチェック',
    description: 'アプリが動いているかを返す。Cloud Run の起動確認などに使う。認証不要',
    tag: 'ヘルスチェック',
    auth: 'none',
    request: { query: healthQuerySchema },
    response: { status: 200, description: 'アプリが動いている', schema: dataResponseSchema(healthSchema) },
  })
}
