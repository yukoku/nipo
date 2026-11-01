import { z } from 'zod'

import { pageMetaSchema } from '@/schemas/pagination'

/** 成功時のレスポンス `{ data }`（docs/api.md §1.1、決定事項 #21） */
export function dataResponseSchema<T extends z.ZodType>(data: T) {
  return z.object({ data })
}

/** 一覧のレスポンス `{ data, meta }`（docs/api.md §1.4） */
export function listResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema })
}
