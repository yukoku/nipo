import { PenLine } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { ListPagination } from '@/components/list-pagination'
import { Button } from '@/components/ui/button'
import { ReportList } from '@/features/reports/report-list'
import { ReportListSkeleton } from '@/features/reports/report-list-skeleton'
import { ReportSearchForm } from '@/features/reports/report-search-form'
import { toCamelCaseKeys } from '@/lib/case'
import { startOfMonthInJst, todayInJst } from '@/lib/date'
import { type SearchParamsRecord, firstValues } from '@/lib/list-query'
import { DEFAULT_PER_PAGE } from '@/schemas/pagination'
import { reportListQuerySchema } from '@/schemas/report'
import { requirePageRole, rethrowAsPageError } from '@/server/auth/page-auth'
import type { AuthzUser } from '@/server/authz/report'
import {
  type ReportListInput,
  findOwnReportId,
  listReportSubordinateOptions,
  listReports,
  requireReportListAccess,
} from '@/server/services/report'

export const metadata: Metadata = { title: '日報一覧' }

/** 担当者セレクトで、ログインユーザー自身を表す表示名（docs/screens.md SC-02・T-UI-04） */
const SELF_LABEL = '自分'

/** 日報一覧（SC-02）。営業・上長のトップ画面 */
export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const user = await requirePageRole('SALES', 'MANAGER')
  const today = todayInJst()
  const query = parseQuery(await searchParams, today)

  // 閲覧できない担当者を指定された（URL を書き換えた）ときは 403 画面にする。
  // 一覧の読み込み（Suspense で後から送る）より前に確かめ、403 のステータスを正しく返す
  await requireReportListAccess(user, query.salesStaffId).catch(rethrowAsPageError)
  const [subordinates, todayReportId] = await Promise.all([
    listReportSubordinateOptions(user),
    findOwnReportId(user, today),
  ])
  // 今日の日報がなければ新規作成、あれば編集へ（T-UI-07・08）
  const todayHref = todayReportId === null ? '/reports/new' : `/reports/${todayReportId}/edit`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">日報一覧</h1>
        <Button asChild>
          <Link href={todayHref}>
            <PenLine aria-hidden />
            今日の日報を書く
          </Link>
        </Button>
      </div>

      <ReportSearchForm
        // 検索条件が変わったら、フォームの入力欄も URL の値に合わせて作り直す
        key={JSON.stringify([query.dateFrom, query.dateTo, query.salesStaffId, query.customerName])}
        initialValues={{
          dateFrom: query.dateFrom ?? '',
          dateTo: query.dateTo ?? '',
          salesStaffId: query.salesStaffId ?? null,
          customerName: query.customerName ?? '',
        }}
        staffOptions={user.role === 'MANAGER' ? [{ id: user.id, name: SELF_LABEL }, ...subordinates] : undefined}
      />

      {/* 検索条件・ページが変わるたびに、読み込み中の表示（スケルトン）を出す */}
      <Suspense key={JSON.stringify(query)} fallback={<ReportListSkeleton />}>
        <ReportResults user={user} query={query} />
      </Suspense>
    </div>
  )
}

/** 一覧部分（件数・一覧・ページ送り）。読み込みを待つ間はスケルトンを出す */
async function ReportResults({ user, query }: { user: AuthzUser; query: ReportListInput }) {
  const { items, meta } = await listReports(user, query)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {meta.total_count} 件
      </p>
      <ReportList reports={items} />
      <ListPagination
        meta={meta}
        pathname="/reports"
        query={{
          date_from: query.dateFrom,
          date_to: query.dateTo,
          sales_staff_id: query.salesStaffId,
          customer_name: query.customerName,
        }}
      />
    </div>
  )
}

/**
 * URL のクエリを検索条件にする（docs/screens.md SC-02）。
 * - 期間を指定していなければ、初期値（当月 1 日〜今日）にする
 * - 正しくない値（`?page=abc`・終了日が開始日より前 など）があれば、条件なし（期間は初期値）の 1 ページ目にする
 * - 1 ページの件数は 20 件に固定する（docs/screens.md §3.2）
 */
function parseQuery(searchParams: SearchParamsRecord, today: string) {
  const values = firstValues(searchParams)
  const withDefaults = {
    ...values,
    date_from: values.date_from ?? startOfMonthInJst(),
    date_to: values.date_to ?? today,
    per_page: undefined,
  }
  const result = reportListQuerySchema.safeParse(withDefaults)
  const parsed = result.success
    ? result.data
    : reportListQuerySchema.parse({ date_from: startOfMonthInJst(), date_to: today })
  return toCamelCaseKeys({ ...parsed, per_page: DEFAULT_PER_PAGE })
}
