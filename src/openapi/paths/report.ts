import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import {
  reportCreateRequestSchema,
  reportListItemSchema,
  reportListQuerySchema,
  reportSchema,
  reportUpdateRequestSchema,
} from '@/schemas/report'
import { idParamsSchema } from '@/schemas/id'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'

const TAG = '日報'

/** 日報 API（docs/api.md §4）。Route Handler：src/app/api/v1/reports/route.ts・[id]/route.ts */
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

  registerApi(registry, {
    method: 'get',
    path: '/reports/{id}',
    id: 'R-03',
    summary: '日報詳細取得',
    description: [
      '本人は自分の日報（下書きを含む）、上長は直属の部下の提出済み日報を取得できる。',
      '日報がない・閲覧できないときは、どちらも同じ 404（存在を推測させない）。管理者も 404。',
      '訪問記録は sort_order の順、コメントは created_at の昇順。permissions はログインユーザーから見た値',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema },
    errors: [404],
    response: { status: 200, description: '日報', schema: dataResponseSchema(reportSchema) },
  })

  registerApi(registry, {
    method: 'put',
    path: '/reports/{id}',
    id: 'R-04',
    summary: '日報更新',
    description: [
      '本人だけ。閲覧できない・ない日報は 404、本人以外は 403、コメントが付いていれば 409（reason: REPORT_LOCKED）。',
      'report_date は受け取らない（送られても無視）。提出済みを下書きに戻すのは 400。submitted_at は初めて提出したときだけ入れる。',
      'visit_records は全件置き換え：id 付きは更新、id なしは追加、送られなかった既存行は削除し、sort_order は送られた順に振り直す。',
      '他の日報の訪問記録の id は 400。顧客は有効であること（既存行で顧客を変えていなければ確かめない）',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema, body: reportUpdateRequestSchema },
    errors: [404, 409],
    response: { status: 200, description: '更新後の日報', schema: dataResponseSchema(reportSchema) },
  })
}
