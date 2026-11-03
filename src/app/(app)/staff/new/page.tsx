import type { Metadata } from 'next'

import { StaffForm } from '@/features/staff/staff-form'
import { requirePageRole } from '@/server/auth/page-auth'
import { listManagerOptions } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '営業登録' }

/** 営業登録（SC-08 新規）。管理者のみ */
export default async function NewStaffPage() {
  const user = await requirePageRole('ADMIN')
  const managerOptions = await listManagerOptions(user)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">営業登録</h1>
      <StaffForm managerOptions={managerOptions} />
    </div>
  )
}
