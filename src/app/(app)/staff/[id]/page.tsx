import type { Metadata } from 'next'

import { StaffForm } from '@/features/staff/staff-form'
import { parseIdParam } from '@/server/api/params'
import { requirePageRole, rethrowAsPageError } from '@/server/auth/page-auth'
import { getStaff, listManagerOptions } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '営業編集' }

/** 営業編集（SC-08 編集）。管理者のみ。存在しない営業・数字でない ID は 404 画面 */
export default async function EditStaffPage({ params }: PageProps<'/staff/[id]'>) {
  const user = await requirePageRole('ADMIN')
  const { id } = await params

  const staff = await Promise.resolve()
    .then(() => getStaff(user, parseIdParam(id)))
    .catch(rethrowAsPageError)
  // 上長の選択肢から、本人と配下を除く（循環防止。T-UI-23）
  const managerOptions = await listManagerOptions(user, staff.id)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">営業編集</h1>
      <StaffForm
        staff={{
          id: staff.id,
          name: staff.name,
          email: staff.email,
          department: staff.department,
          role: staff.role,
          manager: staff.manager,
          isActive: staff.isActive,
          subordinateCount: staff.subordinateCount,
        }}
        managerOptions={managerOptions}
        isSelf={staff.id === user.id}
      />
    </div>
  )
}
