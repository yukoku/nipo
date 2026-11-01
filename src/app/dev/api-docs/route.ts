import { ApiReference } from '@scalar/nextjs-api-reference'

import { isDevPageEnabled, notFoundResponse } from '@/app/dev/api-docs/dev-only'

/**
 * 開発用の API ドキュメント（Scalar）。http://localhost:3000/dev/api-docs で開く。本番では 404 にする。
 * 定義は保存前の変更も反映されるよう、docs/openapi.yaml ではなく openapi.json のルートで毎回作り直す
 */
const apiReference = ApiReference({
  url: '/dev/api-docs/openapi.json',
  pageTitle: '営業日報システム API（開発用）',
})

export function GET(): Response | Promise<Response> {
  return isDevPageEnabled() ? apiReference() : notFoundResponse()
}
