import type { Metadata } from 'next'

import { ReportForm } from '@/features/reports/report-form'
import { todayInJst } from '@/lib/date'
import { requirePageRole } from '@/server/auth/page-auth'
import { listCustomerOptions } from '@/server/services/customer'

export const metadata: Metadata = { title: '日報作成' }

/** 日報作成（SC-03 新規）。営業・上長 */
export default async function NewReportPage() {
  const user = await requirePageRole('SALES', 'MANAGER')
  const customerOptions = await listCustomerOptions(user)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">日報作成</h1>
      <ReportForm today={todayInJst()} customerOptions={customerOptions} />
    </div>
  )
}
