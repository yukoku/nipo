import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { StaffList } from '@/features/staff/staff-list'
import { StaffSearchForm } from '@/features/staff/staff-search-form'
import { toCamelCaseKeys } from '@/lib/case'
import { type SearchParamsRecord, firstValues } from '@/lib/list-query'
import { DEFAULT_PER_PAGE } from '@/schemas/pagination'
import { staffListQuerySchema } from '@/schemas/sales-staff'
import { requirePageRole } from '@/server/auth/page-auth'
import { listDepartments, listStaff } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '営業一覧' }

/** 営業一覧（SC-07）。管理者のみ */
export default async function StaffPage({ searchParams }: PageProps<'/staff'>) {
  const user = await requirePageRole('ADMIN')
  const query = parseQuery(await searchParams)

  const [{ items, meta }, departments] = await Promise.all([listStaff(user, query), listDepartments(user)])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">営業一覧</h1>
        <Button asChild>
          <Link href="/staff/new">
            <Plus aria-hidden />
            新規登録
          </Link>
        </Button>
      </div>

      <StaffSearchForm
        // 検索条件が変わったら、フォームの入力欄も URL の値に合わせて作り直す
        key={JSON.stringify([query.name, query.department, query.includeInactive])}
        initialValues={{
          name: query.name ?? '',
          department: query.department ?? null,
          includeInactive: query.includeInactive,
        }}
        departments={departments}
      />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {meta.total_count} 件
        </p>
        <StaffList staff={items} />
        <ListPagination
          meta={meta}
          pathname="/staff"
          query={{ name: query.name, department: query.department, include_inactive: query.includeInactive }}
        />
      </div>
    </div>
  )
}

/**
 * URL のクエリを検索条件にする。正しくない値（`?page=abc` など）があれば、条件なしの 1 ページ目にする。
 * 1 ページの件数は画面では 20 件に固定する（docs/screens.md §3.2）。SC-07 にはロールの絞り込みがないため `role` は使わない
 */
function parseQuery(searchParams: SearchParamsRecord) {
  const result = staffListQuerySchema.safeParse({ ...firstValues(searchParams), per_page: undefined, role: undefined })
  const parsed = result.success ? result.data : staffListQuerySchema.parse({})
  return toCamelCaseKeys({ ...parsed, per_page: DEFAULT_PER_PAGE })
}
