import { FileQuestion } from 'lucide-react'
import type { Metadata } from 'next'

import { ErrorPage } from '@/components/error-page'

export const metadata: Metadata = { title: '見つかりません' }

/**
 * 404 画面。存在しない URL や、閲覧できない日報を開いたとき（SC-T-04）。
 * 閲覧できない日報も「見つかりません」と表示し、存在を推測させない（docs/api.md §1.5）
 */
export default function NotFound() {
  return (
    <ErrorPage
      icon={FileQuestion}
      status={404}
      title="見つかりません"
      description="お探しのページは存在しないか、表示する権限がありません。"
    />
  )
}
