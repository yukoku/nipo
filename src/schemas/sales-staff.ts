import { z } from 'zod'

import { roleSchema } from '@/schemas/auth'
import { idSchema } from '@/schemas/id'
import { emptyToUndefined, paginationQuerySchema } from '@/schemas/pagination'
import { passwordSchema } from '@/schemas/password'
import { optionalText } from '@/schemas/text'

/** 営業の項目の文字数の上限（docs/api.md §7 S-02） */
export const STAFF_LIMITS = {
  name: 50,
  email: 255,
  department: 50,
} as const

/** エラーメッセージの項目名の上書き（`name` は API ごとに意味が違うため） */
export const STAFF_FIELD_LABELS = { name: '氏名' } as const

/**
 * メールアドレス。前後の空白を除き、小文字にそろえて保存する（ログインは大文字・小文字を区別しないため。決定事項 #31）。
 * 空なら「必須」、入力があるときだけ形式を確かめる
 */
const emailSchema = z
  .string()
  .trim()
  .min(1)
  .max(STAFF_LIMITS.email)
  .pipe(z.email())
  .transform((value) => value.toLowerCase())
  .meta({ description: 'メールアドレス（ログイン ID）。小文字にそろえて保存する', example: 'yamada@example.com' })

const staffFields = {
  name: z.string().trim().min(1).max(STAFF_LIMITS.name).meta({ description: '氏名', example: '山田太郎' }),
  email: emailSchema,
  department: optionalText(STAFF_LIMITS.department).meta({ description: '部署（フリーテキスト）', example: '営業1課' }),
  role: roleSchema,
  manager_id: idSchema
    .nullish()
    .transform((value) => value ?? null)
    .meta({
      description: '上長の ID。有効な上長（manager）であること。権限が manager の人には指定できない（null のみ。決定事項 #35）。未設定なら null',
      example: 1,
    }),
}

/** 権限が「上長」の人に上長を指定したときのメッセージ（決定事項 #35） */
export const MANAGER_OF_MANAGER_MESSAGE = '権限が「上長」の担当者には、上長を設定できません'

/**
 * 権限が「上長」（manager）の人には上長を設定できない（決定事項 #35）。`manager_id` は null でなければエラー。
 * 他の項目にエラーがあっても確かめる（エラーをまとめて表示するため）
 */
function rejectManagerOfManager(value: { role: string; manager_id: number | null }, ctx: z.RefinementCtx): void {
  if (value.role === 'manager' && value.manager_id !== null) {
    ctx.addIssue({ code: 'custom', path: ['manager_id'], message: MANAGER_OF_MANAGER_MESSAGE })
  }
}

/** S-02 営業登録のリクエスト（docs/api.md §7） */
export const staffCreateRequestSchema = z
  .object({
    ...staffFields,
    password: passwordSchema,
  })
  .superRefine(rejectManagerOfManager)

/** S-04 営業更新のリクエスト：S-02 の項目 ＋ `is_active`。`password` は省略・空文字なら変更しない */
export const staffUpdateRequestSchema = z
  .object({
    ...staffFields,
    password: z
      .preprocess((value) => (value === '' || value === null ? undefined : value), passwordSchema.optional())
      .meta({ description: '新しいパスワード。省略・空文字・null なら変更しない' }),
    is_active: z.boolean().meta({ description: '有効なら true。無効にするとログインできなくなり、その人のセッションはすべて削除される' }),
  })
  .superRefine(rejectManagerOfManager)

/** S-01 営業一覧のクエリ */
export const staffListQuerySchema = paginationQuerySchema.extend({
  name: z
    .preprocess(emptyToUndefined, z.string().trim().max(STAFF_LIMITS.name).optional())
    .meta({ description: '氏名の部分一致' }),
  department: z
    .preprocess(emptyToUndefined, z.string().trim().max(STAFF_LIMITS.department).optional())
    .meta({ description: '部署の完全一致' }),
  role: z.preprocess(emptyToUndefined, roleSchema.optional()).meta({ description: 'ロールで絞り込む（SC-08 の上長セレクトでは manager）' }),
  include_inactive: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false'))
    .transform((value) => value === 'true')
    .meta({ description: '`true` で無効な担当者も含める' }),
})

const staffRefSchema = z.object({ id: z.int(), name: z.string() })

/** 営業オブジェクト（docs/api.md §7 共通）。`password_hash` はどの API でも返さない */
export const staffSchema = z
  .object({
    id: z.int(),
    name: z.string(),
    email: z.string(),
    department: z.string().nullable(),
    role: roleSchema,
    manager: staffRefSchema.nullable().meta({ description: '上長。未設定なら null' }),
    is_active: z.boolean(),
    created_at: z.string().meta({ example: '2026-04-01T10:00:00+09:00' }),
    updated_at: z.string().meta({ example: '2026-04-01T10:00:00+09:00' }),
  })
  .meta({ id: 'SalesStaff' })

/** S-03 営業詳細：営業オブジェクト ＋ 直属の部下の人数 */
export const staffDetailSchema = staffSchema
  .extend({
    subordinate_count: z.int().meta({ description: '直属の部下の人数（有効な人だけ。決定事項 #17）。SC-08 の無効化の警告（M-11）に使う' }),
  })
  .meta({ id: 'SalesStaffDetail' })

export type StaffCreateRequest = z.output<typeof staffCreateRequestSchema>
export type StaffUpdateRequest = z.output<typeof staffUpdateRequestSchema>
export type StaffListQuery = z.output<typeof staffListQuerySchema>
