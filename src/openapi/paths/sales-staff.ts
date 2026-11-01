import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { idParamsSchema } from '@/schemas/id'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'
import {
  staffCreateRequestSchema,
  staffDetailSchema,
  staffListQuerySchema,
  staffSchema,
  staffUpdateRequestSchema,
} from '@/schemas/sales-staff'

const TAG = '営業マスタ'

/** 営業マスタ API（docs/api.md §7）。Route Handler：src/app/api/v1/sales-staff/route.ts・[id]/route.ts */
export function registerSalesStaffApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'get',
    path: '/sales-staff',
    id: 'S-01',
    summary: '営業一覧取得',
    description: '部署の昇順（部署なしは最後）→ 氏名の昇順。管理者は全員、上長は自分と直属の部下だけ、営業は 403',
    tag: TAG,
    request: { query: staffListQuerySchema },
    response: { status: 200, description: '営業の一覧', schema: listResponseSchema(staffSchema) },
  })

  registerApi(registry, {
    method: 'post',
    path: '/sales-staff',
    id: 'S-02',
    summary: '営業登録',
    description:
      '管理者のみ。`is_active = true` で登録する。メールアドレスは小文字にそろえて保存し、大文字・小文字を区別せずに重複を確かめる。`Location` ヘッダーに作成した営業の URL を付ける',
    tag: TAG,
    request: { body: staffCreateRequestSchema },
    errors: [409],
    response: { status: 201, description: '登録した営業', schema: dataResponseSchema(staffSchema) },
  })

  registerApi(registry, {
    method: 'get',
    path: '/sales-staff/{id}',
    id: 'S-03',
    summary: '営業詳細取得',
    description: '管理者のみ。直属の部下の人数（有効な人だけ）を含める',
    tag: TAG,
    request: { params: idParamsSchema },
    errors: [403, 404],
    response: { status: 200, description: '営業', schema: dataResponseSchema(staffDetailSchema) },
  })

  registerApi(registry, {
    method: 'put',
    path: '/sales-staff/{id}',
    id: 'S-04',
    summary: '営業更新',
    description: [
      '管理者のみ。S-02 の項目と `is_active` で置き換える（`password` は省略・空文字なら変更しない）。',
      '自分自身・自分の配下を上長にする、管理者が自分を無効化・権限変更するのは 400。',
      '有効な部下がいる人の権限を「上長」以外に変えるのは 409。無効にすると、その人のセッションをすべて削除する',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema, body: staffUpdateRequestSchema },
    errors: [404, 409],
    response: { status: 200, description: '更新後の営業', schema: dataResponseSchema(staffSchema) },
  })
}
