import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { CustomerList } from '@/features/customers/customer-list'
import { CustomerSearchForm } from '@/features/customers/customer-search-form'
import { toCamelCaseKeys } from '@/lib/case'
import { type SearchParamsRecord, firstValues } from '@/lib/list-query'
import { DEFAULT_PER_PAGE } from '@/schemas/pagination'
import { customerListQuerySchema } from '@/schemas/customer'
import { requirePageRole } from '@/server/auth/page-auth'
import { listCustomers } from '@/server/services/customer'
import { listStaffOptions } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '顧客一覧' }

/** 顧客一覧（SC-05）。管理者のみ */
export default async function CustomersPage({ searchParams }: PageProps<'/customers'>) {
  const user = await requirePageRole('ADMIN')
  const query = parseQuery(await searchParams)

  const [{ items, meta }, staffOptions] = await Promise.all([
    listCustomers(user, query),
    listStaffOptions(user, ['SALES', 'MANAGER']),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">顧客一覧</h1>
        <Button asChild>
          <Link href="/customers/new">
            <Plus aria-hidden />
            新規登録
          </Link>
        </Button>
      </div>

      <CustomerSearchForm
        // 検索条件が変わったら、フォームの入力欄も URL の値に合わせて作り直す
        key={JSON.stringify([query.name, query.assignedSalesId, query.includeInactive])}
        initialValues={{
          name: query.name ?? '',
          assignedSalesId: query.assignedSalesId ?? null,
          includeInactive: query.includeInactive,
        }}
        staffOptions={staffOptions}
      />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {meta.total_count} 件
        </p>
        <CustomerList customers={items} />
        <ListPagination
          meta={meta}
          pathname="/customers"
          query={{ name: query.name, assigned_sales_id: query.assignedSalesId, include_inactive: query.includeInactive }}
        />
      </div>
    </div>
  )
}

/**
 * URL のクエリを検索条件にする。正しくない値（`?page=abc` など）があれば、条件なしの 1 ページ目にする。
 * 1 ページの件数は画面では 20 件に固定する（docs/screens.md §3.2）
 */
function parseQuery(searchParams: SearchParamsRecord) {
  const result = customerListQuerySchema.safeParse({ ...firstValues(searchParams), per_page: undefined })
  const parsed = result.success ? result.data : customerListQuerySchema.parse({})
  return toCamelCaseKeys({ ...parsed, per_page: DEFAULT_PER_PAGE })
}
