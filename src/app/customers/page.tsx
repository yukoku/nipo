import type { Metadata } from 'next'

import { requirePageRole } from '@/server/auth/page-auth'

export const metadata: Metadata = { title: '顧客一覧' }

// 仮の顧客一覧（SC-05）。一覧の表示は #25 で作る
export default async function CustomersPage() {
  await requirePageRole('ADMIN')

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold">顧客一覧</h1>
      <p className="text-muted-foreground">準備中です。</p>
    </main>
  )
}
