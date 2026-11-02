import type { Metadata } from 'next'

import { CustomerForm } from '@/features/customers/customer-form'
import { requirePageRole } from '@/server/auth/page-auth'
import { listStaffOptions } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '顧客登録' }

/** 顧客登録（SC-06 新規）。管理者のみ */
export default async function NewCustomerPage() {
  const user = await requirePageRole('ADMIN')
  // 担当営業に指定できるのは有効な営業・上長（決定事項 #30）
  const staffOptions = await listStaffOptions(user, ['SALES', 'MANAGER'])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">顧客登録</h1>
      <CustomerForm staffOptions={staffOptions} />
    </div>
  )
}
