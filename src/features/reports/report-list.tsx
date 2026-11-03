import Link from 'next/link'

import { LinkRow } from '@/components/link-row'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateForDisplay } from '@/lib/date'
import type { ReportStatus } from '@/schemas/report'

export interface ReportListItem {
  id: number
  reportDate: string
  salesStaff: { id: number; name: string }
  status: ReportStatus
  visitCount: number
  commentCount: number
  needsComment: boolean
}

export const reportDetailPath = (id: number) => `/reports/${id}`

const STATUS_LABELS: Record<ReportStatus, string> = { draft: '下書き', submitted: '提出済み' }

/**
 * 日報一覧（SC-02）の一覧部分。PC 幅では表、スマートフォン幅ではカードで表示する（docs/screens.md §3.2・T-UI-25）。
 * 行（カード）を押すと日報詳細（SC-04）へ移る
 */
export function ReportList({ reports }: { reports: ReportListItem[] }) {
  if (reports.length === 0) {
    return <p className="rounded-lg border p-8 text-center text-muted-foreground">該当する日報はありません</p>
  }

  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="日報の一覧">
          <TableHeader>
            <TableRow>
              <TableHead>日付</TableHead>
              <TableHead>担当者</TableHead>
              <TableHead className="text-right">訪問件数</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>コメント</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <LinkRow key={report.id} href={reportDetailPath(report.id)}>
                <TableCell className="font-medium">
                  <Link href={reportDetailPath(report.id)} className="hover:underline">
                    {formatDateForDisplay(report.reportDate)}
                  </Link>
                </TableCell>
                <TableCell>{report.salesStaff.name}</TableCell>
                <TableCell className="text-right">{report.visitCount}</TableCell>
                <TableCell>
                  <StatusBadge status={report.status} />
                </TableCell>
                <TableCell>
                  <CommentCount report={report} />
                </TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="日報の一覧" className="flex flex-col gap-2 md:hidden">
        {reports.map((report) => (
          <li key={report.id}>
            <Link
              href={reportDetailPath(report.id)}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{formatDateForDisplay(report.reportDate)}</span>
                <StatusBadge status={report.status} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">担当者</dt>
                <dd>{report.salesStaff.name}</dd>
                <dt className="text-muted-foreground">訪問件数</dt>
                <dd>{report.visitCount} 件</dd>
                <dt className="text-muted-foreground">コメント</dt>
                <dd>
                  <CommentCount report={report} />
                </dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return status === 'submitted' ? (
    <Badge variant="secondary">{STATUS_LABELS.submitted}</Badge>
  ) : (
    <Badge variant="outline">{STATUS_LABELS.draft}</Badge>
  )
}

/**
 * コメント件数。下書きは「-」（コメントできないため）。
 * 上長から見てまだコメントしていない部下の提出済み日報には「●」を付ける（T-UI-05）
 */
function CommentCount({ report }: { report: ReportListItem }) {
  if (report.status === 'draft') {
    return <span aria-label="コメントなし（下書き）">-</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {report.commentCount} 件
      {report.needsComment && (
        <span className="text-destructive" role="img" aria-label="未コメント">
          ●
        </span>
      )}
    </span>
  )
}
