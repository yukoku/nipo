import 'server-only'

import { NotFoundError } from '@/server/api/errors'
import { idQuerySchema } from '@/schemas/id'

/**
 * パスの `{id}`（例：`/customers/{id}` の `10`）を数値にする。
 * ID として正しくない値（`abc`・`0`・int の上限を超える値）は、存在しない ID と同じく `NotFoundError`（404）にする
 *
 * @example
 * export const GET = withApi(async (request, { params }: RouteContext<'/api/v1/customers/[id]'>) => {
 *   const id = parseIdParam((await params).id)
 * })
 */
export function parseIdParam(value: string | string[] | undefined): number {
  // `z.coerce.number()` は空文字・空白を 0 にするため、数字だけの文字列に限る
  const result = typeof value === 'string' && /^\d+$/.test(value) ? idQuerySchema.safeParse(value) : undefined
  if (!result?.success) {
    throw new NotFoundError()
  }
  return result.data
}
