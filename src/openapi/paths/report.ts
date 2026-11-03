import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { reportCreateRequestSchema, reportListItemSchema, reportListQuerySchema, reportSchema } from '@/schemas/report'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'

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

  registerApi(registry, {
    method: 'post',
    path: '/reports',
    id: 'R-02',
    summary: '日報作成',
    description: [
      '営業・上長だけ（管理者は 403）。担当者はログインユーザーで固定する。',
      '提出（submitted）なら Problem・Plan が必須。訪問記録は 0〜20 件で、顧客は有効な顧客だけ。配列の順に sort_order を 1 から振る。',
      '同じ日付の日報が既にあれば 409（reason: REPORT_ALREADY_EXISTS）。`Location` ヘッダーに作成した日報の URL を付ける',
    ].join(''),
    tag: TAG,
    request: { body: reportCreateRequestSchema },
    errors: [409],
    response: { status: 201, description: '作成した日報', schema: dataResponseSchema(reportSchema) },
  })
}
