import { isDevPageEnabled, notFoundResponse } from '@/app/dev/api-docs/dev-only'
import { createOpenApiDocument } from '@/openapi/document'

/** 開発用の API ドキュメントが読み込む OpenAPI 定義（JSON）。本番では 404 にする */
export function GET(): Response {
  return isDevPageEnabled() ? Response.json(createOpenApiDocument()) : notFoundResponse()
}
