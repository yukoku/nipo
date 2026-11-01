import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { type QueryValues, buildQueryString, pageItems } from '@/lib/list-query'
import type { PageMeta } from '@/schemas/pagination'

interface ListPaginationProps {
  /** 一覧の `meta`（services の形） */
  meta: Pick<PageMeta, 'page' | 'total_pages'>
  /** 一覧画面のパス（例：`/customers`） */
  pathname: string
  /** 今の検索条件。ページを移っても条件を保つ */
  query: QueryValues
}

/**
 * 一覧画面のページ送り（docs/screens.md §3.2：1 ページ 20 件）。1 ページしかなければ出さない。
 * Next.js の Link で移動する（画面全体を読み込み直さない）
 */
export function ListPagination({ meta, pathname, query }: ListPaginationProps) {
  const { page, total_pages: totalPages } = meta
  if (totalPages <= 1) {
    return null
  }
  const href = (target: number) => `${pathname}${buildQueryString({ ...query, page: target })}`

  return (
    <Pagination aria-label="ページ送り">
      <PaginationContent>
        <PaginationItem>
          <PageButton href={page > 1 ? href(page - 1) : undefined} label="前のページ">
            <ChevronLeft aria-hidden />
            <span className="hidden sm:inline">前へ</span>
          </PageButton>
        </PaginationItem>
        {pageItems(page, totalPages).map((item, index) =>
          item === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <Button asChild variant={item === page ? 'outline' : 'ghost'} size="icon">
                <Link href={href(item)} aria-label={`${item}ページ目`} aria-current={item === page ? 'page' : undefined}>
                  {item}
                </Link>
              </Button>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PageButton href={page < totalPages ? href(page + 1) : undefined} label="次のページ">
            <span className="hidden sm:inline">次へ</span>
            <ChevronRight aria-hidden />
          </PageButton>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

/** 「前へ」「次へ」。移動先がなければ押せないボタンにする */
function PageButton({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  if (href === undefined) {
    return (
      <Button variant="ghost" disabled aria-label={label}>
        {children}
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost">
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  )
}
