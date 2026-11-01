import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import {
  customerCreateRequestSchema,
  customerListQuerySchema,
  customerSchema,
  customerUpdateRequestSchema,
} from '@/schemas/customer'
import { idParamsSchema } from '@/schemas/id'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'

const TAG = '顧客マスタ'

/** 顧客マスタ API（docs/api.md §6）。Route Handler：src/app/api/v1/customers/route.ts・[id]/route.ts */
export function registerCustomerApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'get',
    path: '/customers',
    id: 'M-01',
    summary: '顧客一覧取得',
    description:
      '顧客名の昇順。全ロールが使える。管理者以外は `include_inactive` を指定しても無視し、有効な顧客だけを返す（日報入力の顧客選択に使う）',
    tag: TAG,
    request: { query: customerListQuerySchema },
    response: { status: 200, description: '顧客の一覧', schema: listResponseSchema(customerSchema) },
  })

  registerApi(registry, {
    method: 'post',
    path: '/customers',
    id: 'M-02',
    summary: '顧客登録',
    description: '管理者のみ。`is_active = true` で登録する。`Location` ヘッダーに作成した顧客の URL を付ける',
    tag: TAG,
    request: { body: customerCreateRequestSchema },
    response: { status: 201, description: '登録した顧客', schema: dataResponseSchema(customerSchema) },
  })

  registerApi(registry, {
    method: 'get',
    path: '/customers/{id}',
    id: 'M-03',
    summary: '顧客詳細取得',
    description: '管理者のみ',
    tag: TAG,
    request: { params: idParamsSchema },
    errors: [403, 404],
    response: { status: 200, description: '顧客', schema: dataResponseSchema(customerSchema) },
  })

  registerApi(registry, {
    method: 'put',
    path: '/customers/{id}',
    id: 'M-04',
    summary: '顧客更新',
    description:
      '管理者のみ。M-02 の項目と `is_active` で置き換える（省略した任意項目は未設定になる）。無効にしても、過去の訪問記録からの参照は残る',
    tag: TAG,
    request: { params: idParamsSchema, body: customerUpdateRequestSchema },
    errors: [404],
    response: { status: 200, description: '更新後の顧客', schema: dataResponseSchema(customerSchema) },
  })
}
