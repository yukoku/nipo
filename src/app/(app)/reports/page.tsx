import type { Metadata } from 'next'

import { requirePageRole } from '@/server/auth/page-auth'

export const metadata: Metadata = { title: '日報一覧' }

// 仮の日報一覧（SC-02）。一覧の表示は #34 で作る
export default async function ReportsPage() {
  await requirePageRole('SALES', 'MANAGER')

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">日報一覧</h1>
      <p className="text-muted-foreground">準備中です。</p>
    </div>
  )
}
