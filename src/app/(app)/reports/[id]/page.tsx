import type { Metadata } from 'next'

import { ReportDetail } from '@/features/reports/report-detail'
import { firstValues } from '@/lib/list-query'
import { REPORT_LIST_QUERY_PARAM, reportListPath } from '@/lib/routes'
import { parseIdParam } from '@/server/api/params'
import { requirePageRole, rethrowAsPageError } from '@/server/auth/page-auth'
import { getReport } from '@/server/services/report'

export const metadata: Metadata = { title: '日報詳細' }

/**
 * 日報詳細（SC-04）。営業・上長。
 * 閲覧できない・存在しない・数字でない ID の日報は、どれも 404 画面（存在を推測させない。SC-T-04）
 */
export default async function ReportDetailPage({ params, searchParams }: PageProps<'/reports/[id]'>) {
  const user = await requirePageRole('SALES', 'MANAGER')
  const { id } = await params
  const listQuery = firstValues(await searchParams)[REPORT_LIST_QUERY_PARAM]

  const report = await Promise.resolve()
    .then(() => getReport(user, parseIdParam(id)))
    .catch(rethrowAsPageError)

  return <ReportDetail report={report} listHref={reportListPath(listQuery)} currentUserId={user.id} />
}
