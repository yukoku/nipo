import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'

import { API_BASE_PATH } from '@/lib/api-constants'
import { registerAuthApis } from '@/openapi/paths/auth'
import { registerCommentApis } from '@/openapi/paths/comment'
import { registerCustomerApis } from '@/openapi/paths/customer'
import { registerSalesStaffApis } from '@/openapi/paths/sales-staff'
import { registerHealthApis } from '@/openapi/paths/health'
import { registerReportApis } from '@/openapi/paths/report'
import { COMMON_SCHEMAS, createRegistry } from '@/openapi/registry'

/**
 * API を登録する関数の一覧。API を追加したら、src/openapi/paths/ に登録する関数を作り、ここに足す
 */
const REGISTRARS = [
  registerAuthApis,
  registerReportApis,
  registerCommentApis,
  registerCustomerApis,
  registerSalesStaffApis,
  registerHealthApis,
]

type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>

/** OpenAPI 3.1 の定義を作る（`npm run openapi:generate` で docs/openapi.yaml に出力する） */
export function createOpenApiDocument(): OpenApiDocument {
  const registry = createRegistry()
  for (const register of REGISTRARS) {
    register(registry)
  }

  return new OpenApiGeneratorV31([...COMMON_SCHEMAS, ...registry.definitions]).generateDocument({
    openapi: '3.1.0',
    info: {
      title: '営業日報システム API',
      version: '1.0.0',
      description: [
        'docs/api.md の API 仕様を、Route Handler の入力チェックと同じ Zod スキーマから生成した定義。',
        'このファイルは `npm run openapi:generate` で生成する。手で編集しない。',
      ].join('\n'),
    },
    servers: [{ url: API_BASE_PATH }],
  })
}
