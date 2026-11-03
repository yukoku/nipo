import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ReportForm } from '@/features/reports/report-form'
import { todayInJst } from '@/lib/date'
import { reportDetailPath } from '@/lib/routes'
import { parseIdParam } from '@/server/api/params'
import { requirePageRole, rethrowAsPageError } from '@/server/auth/page-auth'
import { getReport } from '@/server/services/report'

export const metadata: Metadata = { title: '日報編集' }

/**
 * 日報編集（SC-03 編集）。営業・上長。
 * - 閲覧できない・ない日報は 404 画面（存在を推測させない）
 * - 閲覧はできるが編集できない日報（コメント付き・上長から見た部下の日報）は、日報詳細（SC-04）へ戻す
 */
export default async function EditReportPage({ params }: PageProps<'/reports/[id]/edit'>) {
  const user = await requirePageRole('SALES', 'MANAGER')
  const { id } = await params

  const report = await Promise.resolve()
    .then(() => getReport(user, parseIdParam(id)))
    .catch(rethrowAsPageError)
  if (!report.permissions.canEdit) {
    redirect(reportDetailPath(report.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">日報編集</h1>
      <ReportForm
        today={todayInJst()}
        report={{
          id: report.id,
          reportDate: report.reportDate,
          status: report.status,
          problem: report.problem,
          plan: report.plan,
          visitRecords: report.visitRecords.map((record) => ({
            id: record.id,
            customer_id: record.customer.id,
            customerName: record.customer.name,
            visited_at: record.visitedAt,
            content: record.content,
          })),
        }}
      />
    </div>
  )
}
