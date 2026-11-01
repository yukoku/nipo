import { ShieldX } from 'lucide-react'
import type { Metadata } from 'next'

import { ErrorPage } from '@/components/error-page'

export const metadata: Metadata = { title: 'アクセスできません' }

/** 403 画面。権限のない画面を開いたとき（`forbidden()`。docs/screens.md §3.1） */
export default function Forbidden() {
  return (
    <ErrorPage
      icon={ShieldX}
      status={403}
      title="アクセスできません"
      description="この画面を表示する権限がありません。"
    />
  )
}
