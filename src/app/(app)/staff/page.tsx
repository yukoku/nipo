import type { Metadata } from 'next'

import { requirePageRole } from '@/server/auth/page-auth'

export const metadata: Metadata = { title: '営業一覧' }

// 仮の営業一覧（SC-07）。一覧の表示は #27 で作る
export default async function StaffPage() {
  await requirePageRole('ADMIN')

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">営業一覧</h1>
      <p className="text-muted-foreground">準備中です。</p>
    </div>
  )
}
