import { z } from 'zod'

/** ID（DB の int 列）の上限。これを超える値を Prisma に渡すと例外（500）になるため、入力チェックで止める */
export const MAX_ID = 2_147_483_647

/** リクエストの本文で受け取る ID（例：`assigned_sales_id`） */
export const idSchema = z.int().min(1).max(MAX_ID)

/** クエリ文字列で受け取る ID（例：`?assigned_sales_id=2`）。文字列を数値にする */
export const idQuerySchema = z.coerce.number().int().min(1).max(MAX_ID)

/**
 * パスの `{id}`（例：`/customers/{id}`）。OpenAPI の定義に使う。
 * Route Handler では `parseIdParam()`（`@/server/api/params`）で読み、ID として正しくない値は 404 にする
 */
export const idParamsSchema = z.object({
  id: idQuerySchema.meta({ description: 'ID', example: 10 }),
})
