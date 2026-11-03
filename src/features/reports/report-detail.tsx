import { ArrowLeftIcon, PencilIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateForDisplay, formatDateTimeForDisplay } from '@/lib/date'
import { reportEditPath } from '@/lib/routes'
import type { ReportStatus } from '@/schemas/report'

import { type ReportComment, ReportComments } from './report-comments'
import { ReportStatusBadge } from './report-status-badge'

/** 日報詳細に表示する日報（`getReport()` の結果のうち、この画面で使う項目） */
export interface ReportDetailReport {
  id: number
  reportDate: string
  salesStaff: { id: number; name: string }
  status: ReportStatus
  submittedAt: Date | null
  problem: string | null
  plan: string | null
  visitRecords: {
    id: number
    customer: { id: number; name: string }
    visitedAt: string | null
    content: string
  }[]
  /** コメント（投稿日時の古い順） */
  comments: readonly ReportComment[]
  permissions: { canEdit: boolean; canComment: boolean }
}

/** 未入力の項目の表示 */
const EMPTY_TEXT = '（未入力）'

/** 訪問時刻が未入力のときの表示 */
const NO_TIME = '-'

/**
 * 日報詳細（SC-04）の日報の表示
 *
 * - ヘッダー：報告日・担当者・ステータス・提出日時（下書きは提出日時を出さない）
 * - 訪問記録（`sort_order` 順）・Problem・Plan。改行はそのまま表示する（T-UI-20）
 * - 利用者が入力した文字は React の通常の描画で出す（`dangerouslySetInnerHTML` は使わない。HTML はエスケープされる。T-UI-21）
 * - 「編集」は本人が編集できるときだけ出す（`permissions.canEdit`。T-UI-17）
 * - 「一覧へ戻る」は、一覧から引き継いだ検索条件の一覧に戻る（`listHref`。T-UI-06）
 * - Problem・Plan の下に、それぞれのコメントを出す（T-UI-19。投稿・編集・削除は `ReportComments`）
 */
export function ReportDetail({
  report,
  listHref,
  currentUserId,
}: {
  report: ReportDetailReport
  listHref: string
  /** ログインユーザーの ID（自分のコメントだけ編集・削除できるようにする） */
  currentUserId: number
}) {
  const commentProps = { reportId: report.id, canComment: report.permissions.canComment, currentUserId }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">日報詳細</h1>
        <div className="flex flex-wrap gap-2">
          {report.permissions.canEdit && (
            <Button asChild>
              <Link href={reportEditPath(report.id)}>
                <PencilIcon aria-hidden />
                編集
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={listHref}>
              <ArrowLeftIcon aria-hidden />
              一覧へ戻る
            </Link>
          </Button>
        </div>
      </div>

      <dl
        aria-label="日報の情報"
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-[auto_1fr_auto_1fr]"
      >
        <dt className="text-muted-foreground">報告日</dt>
        <dd className="font-medium">{formatDateForDisplay(report.reportDate)}</dd>
        <dt className="text-muted-foreground">担当者</dt>
        <dd>{report.salesStaff.name}</dd>
        <dt className="text-muted-foreground">ステータス</dt>
        <dd>
          <ReportStatusBadge status={report.status} />
        </dd>
        {report.status === 'submitted' && report.submittedAt !== null && (
          <>
            <dt className="text-muted-foreground">提出日時</dt>
            <dd>{formatDateTimeForDisplay(report.submittedAt)}</dd>
          </>
        )}
      </dl>

      <DetailSection id="visit-records" title="訪問記録">
        <VisitRecords records={report.visitRecords} />
      </DetailSection>

      <DetailSection id="problem" title="Problem（課題・相談）">
        <MultilineText text={report.problem} />
        <ReportComments
          {...commentProps}
          target="problem"
          comments={report.comments.filter((comment) => comment.target === 'problem')}
        />
      </DetailSection>

      <DetailSection id="plan" title="Plan（明日やること）">
        <MultilineText text={report.plan} />
        <ReportComments
          {...commentProps}
          target="plan"
          comments={report.comments.filter((comment) => comment.target === 'plan')}
        />
      </DetailSection>
    </div>
  )
}

function DetailSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** 改行をそのまま表示する文章（T-UI-20）。未入力なら「（未入力）」 */
function MultilineText({ text }: { text: string | null }) {
  if (text === null) {
    return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>
  }
  return <p className="text-sm break-words whitespace-pre-wrap">{text}</p>
}

/** 訪問記録。PC 幅では表、スマートフォン幅ではカードで表示する（T-UI-25） */
function VisitRecords({ records }: { records: ReportDetailReport['visitRecords'] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">訪問記録はありません</p>
  }
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="訪問記録">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">時刻</TableHead>
              <TableHead className="w-56">顧客</TableHead>
              <TableHead>訪問内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="align-top">{record.visitedAt ?? NO_TIME}</TableCell>
                <TableCell className="align-top whitespace-normal">{record.customer.name}</TableCell>
                <TableCell className="align-top break-words whitespace-pre-wrap">{record.content}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ol aria-label="訪問記録" className="flex flex-col gap-2 md:hidden">
        {records.map((record) => (
          <li key={record.id} className="rounded-lg border p-3 text-sm">
            <div className="flex gap-3 font-medium">
              <span>{record.visitedAt ?? NO_TIME}</span>
              <span>{record.customer.name}</span>
            </div>
            <p className="mt-1 break-words whitespace-pre-wrap">{record.content}</p>
          </li>
        ))}
      </ol>
    </>
  )
}
