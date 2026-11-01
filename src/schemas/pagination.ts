import { z } from 'zod'

/** 1 ページの件数の初期値と上限（docs/api.md §1.4） */
export const DEFAULT_PER_PAGE = 20
export const MAX_PER_PAGE = 100

/** クエリ文字列の空の値（`?page=`）は、指定なしとして扱う */
export const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

/**
 * 一覧 API の `page`・`per_page`（docs/api.md §1.4）。
 * 一覧 API のクエリのスキーマに `.extend(paginationQuerySchema.shape)` などで組み込んで使う
 */
export const paginationQuerySchema = z.object({
  page: z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1))
    .meta({ description: 'ページ番号（初期値 1）' }),
  per_page: z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE))
    .meta({ description: `1ページの件数（初期値 ${DEFAULT_PER_PAGE}、最大 ${MAX_PER_PAGE}）` }),
})

export type PaginationQuery = z.output<typeof paginationQuerySchema>

/** レスポンスの `meta`（docs/api.md §1.4） */
export const pageMetaSchema = z
  .object({
    page: z.int().meta({ description: 'ページ番号', example: 1 }),
    per_page: z.int().meta({ description: '1ページの件数', example: 20 }),
    total_count: z.int().meta({ description: '全体の件数', example: 53 }),
    total_pages: z.int().meta({ description: '全体のページ数（0 件なら 0）', example: 3 }),
  })
  .meta({ id: 'PageMeta' })

export type PageMeta = z.output<typeof pageMetaSchema>
