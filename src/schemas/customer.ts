import { z } from 'zod'

import { idQuerySchema, idSchema } from '@/schemas/id'
import { emptyToUndefined, paginationQuerySchema } from '@/schemas/pagination'

/** 顧客の項目の文字数の上限（docs/api.md §6 M-02） */
export const CUSTOMER_LIMITS = {
  name: 100,
  contactPerson: 50,
  phone: 20,
  address: 200,
} as const

/** エラーメッセージの項目名の上書き（`name` は API ごとに意味が違うため） */
export const CUSTOMER_FIELD_LABELS = { name: '顧客名' } as const

/** 電話番号に使える文字（数字とハイフンのみ） */
export const PHONE_PATTERN = /^[0-9-]*$/

/**
 * 任意の文字列項目。前後の空白を除き、空文字は `null`（未入力）として保存する。
 * 画面のフォームは未入力の項目を空文字で送るため、`null`・省略・空文字を同じに扱う
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)
}

/** M-02 顧客登録のリクエスト（docs/api.md §6） */
export const customerCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(CUSTOMER_LIMITS.name).meta({ description: '顧客名', example: 'ABC商事' }),
  contact_person: optionalText(CUSTOMER_LIMITS.contactPerson).meta({ description: '先方担当者名', example: '田中様' }),
  phone: z
    .string()
    .trim()
    .max(CUSTOMER_LIMITS.phone)
    .regex(PHONE_PATTERN, { error: '電話番号は数字とハイフンで入力してください' })
    .nullish()
    .transform((value) => value || null)
    .meta({ description: '電話番号（数字とハイフンのみ）', example: '03-1234-5678' }),
  address: optionalText(CUSTOMER_LIMITS.address).meta({ description: '住所', example: '東京都千代田区丸の内1-1-1' }),
  assigned_sales_id: idSchema
    .nullish()
    .transform((value) => value ?? null)
    .meta({ description: '担当営業の ID。有効な営業・上長であること。未設定なら null', example: 2 }),
})

/** M-04 顧客更新のリクエスト：M-02 の項目 ＋ `is_active` */
export const customerUpdateRequestSchema = customerCreateRequestSchema.extend({
  is_active: z.boolean().meta({ description: '有効なら true。無効にした顧客は日報入力の選択肢に出ない' }),
})

/** M-01 顧客一覧のクエリ */
export const customerListQuerySchema = paginationQuerySchema.extend({
  name: z
    .preprocess(emptyToUndefined, z.string().trim().max(CUSTOMER_LIMITS.name).optional())
    .meta({ description: '顧客名の部分一致' }),
  assigned_sales_id: z
    .preprocess(emptyToUndefined, idQuerySchema.optional())
    .meta({ description: '担当営業の ID で絞り込む' }),
  include_inactive: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false'))
    .transform((value) => value === 'true')
    .meta({ description: '`true` で無効な顧客も含める。管理者以外は指定しても無視する（常に有効な顧客だけ）' }),
})

const staffRefSchema = z.object({ id: z.int(), name: z.string() })

/** 顧客オブジェクト（docs/api.md §6 共通） */
export const customerSchema = z
  .object({
    id: z.int(),
    name: z.string(),
    contact_person: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    assigned_sales: staffRefSchema.nullable().meta({ description: '担当営業。未設定なら null' }),
    is_active: z.boolean(),
    created_at: z.string().meta({ example: '2026-04-01T10:00:00+09:00' }),
    updated_at: z.string().meta({ example: '2026-04-01T10:00:00+09:00' }),
  })
  .meta({ id: 'Customer' })

export type CustomerCreateRequest = z.output<typeof customerCreateRequestSchema>
export type CustomerUpdateRequest = z.output<typeof customerUpdateRequestSchema>
export type CustomerListQuery = z.output<typeof customerListQuerySchema>
