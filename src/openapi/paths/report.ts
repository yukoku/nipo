import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { reportListItemSchema, reportListQuerySchema } from '@/schemas/report'
import { listResponseSchema } from '@/schemas/response'

const TAG = '日報'

/** 日報 API（docs/api.md §4）。Route Handler：src/app/api/v1/reports/route.ts */
export function registerReportApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'get',
    path: '/reports',
    id: 'R-01',
    summary: '日報一覧取得',
    description: [
      '営業は自分の日報（下書きを含む）、上長は自分の日報と直属の部下の提出済み日報を返す。管理者は 403。',
      '並び順は報告日の降順 → 担当者名の昇順。',
      '`sales_staff_id` に自分・直属の部下以外を指定すると 403。',
    ].join(''),
    tag: TAG,
    request: { query: reportListQuerySchema },
    response: { status: 200, description: '日報の一覧', schema: listResponseSchema(reportListItemSchema) },
  })
}
