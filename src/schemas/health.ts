import { z } from 'zod'

/** H-01 ヘルスチェックのクエリ（docs/api.md §8） */
export const healthQuerySchema = z.object({
  check: z.enum(['db']).optional().meta({ description: '`db` を指定すると、DB に接続できるかも確認する' }),
})

/** H-01 ヘルスチェックの結果 */
export const healthSchema = z
  .object({
    status: z.literal('ok'),
    checks: z
      .object({ db: z.literal('ok') })
      .optional()
      .meta({ description: '`check` で指定した項目の結果。指定しなければ省略' }),
  })
  .meta({ id: 'Health' })

export type HealthQuery = z.output<typeof healthQuerySchema>
export type Health = z.output<typeof healthSchema>
