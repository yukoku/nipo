import { z } from 'zod'

/**
 * A-01 ログインのリクエスト（docs/api.md §3）。
 * パスワードポリシー（passwordSchema）は使わない。ポリシーを後から変えても、古いパスワードでログインできるようにするため（決定事項 #25）
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(255).meta({ example: 'yamada@example.com' }),
  // 非常に長い値でハッシュの計算に時間をかけさせないよう、上限だけは設ける
  password: z.string().min(1).max(256).meta({ example: 'Passw0rd' }),
})

/** ロール（API の値。docs/api.md §1.3） */
export const roleSchema = z.enum(['sales', 'manager', 'admin']).meta({ id: 'Role' })

const staffRefSchema = z.object({ id: z.number().int(), name: z.string() })

/** A-01・A-03 で返すログインユーザーの情報（docs/api.md §3 A-03） */
export const currentUserSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    email: z.string(),
    department: z.string().nullable(),
    role: roleSchema,
    manager: staffRefSchema.nullable().meta({ description: '上長。未設定なら null' }),
    subordinates: z.array(staffRefSchema).meta({ description: '直属の部下（有効な者のみ）。SC-02 の担当者セレクトに使う' }),
    csrf_token: z.string().meta({ description: '更新系 API の `X-CSRF-Token` ヘッダーに設定する値' }),
  })
  .meta({ id: 'CurrentUser' })

export type LoginRequest = z.output<typeof loginRequestSchema>
export type ApiRole = z.output<typeof roleSchema>
