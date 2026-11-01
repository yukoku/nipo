import 'server-only'

import type { PageMeta } from '@/schemas/pagination'

export interface Pagination {
  page: number
  perPage: number
}

/** `page`・`per_page` を Prisma の `skip`・`take` にする */
export function toPrismaPagination({ page, perPage }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * perPage, take: perPage }
}

/** レスポンスの `meta` を作る（docs/api.md §1.4）。0 件のときの `total_pages` は 0 */
export function buildPageMeta({ page, perPage }: Pagination, totalCount: number): PageMeta {
  return {
    page,
    per_page: perPage,
    total_count: totalCount,
    total_pages: Math.ceil(totalCount / perPage),
  }
}
