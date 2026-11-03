import type { Metadata } from 'next'

import { CustomerForm } from '@/features/customers/customer-form'
import { parseIdParam } from '@/server/api/params'
import { requirePageRole, rethrowAsPageError } from '@/server/auth/page-auth'
import { getCustomer } from '@/server/services/customer'
import { listStaffOptions } from '@/server/services/sales-staff'

export const metadata: Metadata = { title: '顧客編集' }

/** 顧客編集（SC-06 編集）。管理者のみ。存在しない顧客・数字でない ID は 404 画面 */
export default async function EditCustomerPage({ params }: PageProps<'/customers/[id]'>) {
  const user = await requirePageRole('ADMIN')
  const { id } = await params

  const [customer, staffOptions] = await Promise.all([
    Promise.resolve()
      .then(() => getCustomer(user, parseIdParam(id)))
      .catch(rethrowAsPageError),
    listStaffOptions(user, ['SALES', 'MANAGER']),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">顧客編集</h1>
      <CustomerForm
        customer={{
          id: customer.id,
          name: customer.name,
          contactPerson: customer.contactPerson,
          phone: customer.phone,
          address: customer.address,
          assignedSales: customer.assignedSales,
          isActive: customer.isActive,
        }}
        staffOptions={staffOptions}
      />
    </div>
  )
}
