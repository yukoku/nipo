import { Badge } from '@/components/ui/badge'
import type { ReportStatus } from '@/schemas/report'

/** 日報のステータスの表示名 */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { draft: '下書き', submitted: '提出済み' }

/** 日報のステータス（下書き / 提出済み）。日報一覧（SC-02）・日報詳細（SC-04）で使う */
export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={status === 'submitted' ? 'secondary' : 'outline'}>{REPORT_STATUS_LABELS[status]}</Badge>
}
