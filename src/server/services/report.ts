import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { CamelCaseKeys } from '@/lib/case'
import { dateStringToDbDate, dbDateToDateString } from '@/lib/date'
import type { PageMeta } from '@/schemas/pagination'
import type { ReportListQuery, ReportStatus } from '@/schemas/report'
import { ForbiddenError } from '@/server/api/errors'
import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import { type AuthzUser, canComment, canFilterReportsByStaff, viewableReportsWhere } from '@/server/authz/report'
import { requireRole } from '@/server/authz/role'
import { prisma } from '@/server/db/prisma'

export type ReportListInput = CamelCaseKeys<ReportListQuery>

/** R-01 日報一覧の 1 件（services の形。API の形への変換は response で行う） */
export interface ReportListItemView {
  id: number
  reportDate: string
  salesStaff: { id: number; name: string }
  status: ReportStatus
  visitCount: number
  commentCount: number
  needsComment: boolean
}

const reportListSelect = {
  id: true,
  reportDate: true,
  status: true,
  salesStaffId: true,
  salesStaff: { select: { id: true, name: true, managerId: true } },
  // 件数は日報ごとに数える。1 回の SQL の中の副問い合わせになり、日報の件数だけクエリが増える（N+1）ことはない
  _count: { select: { visitRecords: true, comments: true } },
} satisfies Prisma.DailyReportSelect

type ReportListRow = Prisma.DailyReportGetPayload<{ select: typeof reportListSelect }>

/**
 * R-01 日報一覧（docs/api.md §4）。
 *
 * - 営業は自分の日報（下書きを含む）、上長は自分の日報と直属の部下の提出済み日報だけ。管理者は 403（決定事項 #7）
 * - `salesStaffId` は、自分か直属の部下（無効になった部下も含む。決定事項 #16）だけ指定できる。それ以外は 403
 * - 並び順は報告日の降順 → 担当者名の昇順（同じなら ID の昇順）
 */
export async function listReports(
  user: AuthzUser,
  query: ReportListInput,
): Promise<{ items: ReportListItemView[]; meta: PageMeta }> {
  requireRole(user, 'SALES', 'MANAGER')
  if (query.salesStaffId !== undefined) {
    const staff = await prisma.salesStaff.findUnique({
      where: { id: query.salesStaffId },
      select: { id: true, managerId: true },
    })
    if (!canFilterReportsByStaff(user, staff)) {
      throw new ForbiddenError()
    }
  }

  const where: Prisma.DailyReportWhereInput = {
    AND: [
      viewableReportsWhere(user),
      {
        ...((query.dateFrom !== undefined || query.dateTo !== undefined) && {
          reportDate: {
            ...(query.dateFrom !== undefined && { gte: dateStringToDbDate(query.dateFrom) }),
            ...(query.dateTo !== undefined && { lte: dateStringToDbDate(query.dateTo) }),
          },
        }),
        ...(query.salesStaffId !== undefined && { salesStaffId: query.salesStaffId }),
        ...(query.customerName && {
          visitRecords: { some: { customer: { name: { contains: query.customerName, mode: 'insensitive' } } } },
        }),
      },
    ],
  }

  const [rows, totalCount] = await prisma.$transaction([
    prisma.dailyReport.findMany({
      where,
      select: reportListSelect,
      orderBy: [{ reportDate: 'desc' }, { salesStaff: { name: 'asc' } }, { id: 'asc' }],
      ...toPrismaPagination(query),
    }),
    prisma.dailyReport.count({ where }),
  ])
  return { items: rows.map((row) => toListItem(user, row)), meta: buildPageMeta(query, totalCount) }
}

function toListItem(user: AuthzUser, row: ReportListRow): ReportListItemView {
  const commentCount = row._count.comments
  const authz = {
    salesStaffId: row.salesStaffId,
    authorManagerId: row.salesStaff.managerId,
    status: row.status,
    commentCount,
  }
  return {
    id: row.id,
    reportDate: dbDateToDateString(row.reportDate),
    salesStaff: { id: row.salesStaff.id, name: row.salesStaff.name },
    status: row.status === 'SUBMITTED' ? 'submitted' : 'draft',
    visitCount: row._count.visitRecords,
    commentCount,
    // コメントできる日報（直属の上長から見た部下の提出済み日報）で、まだコメントがない（SC-02 の「●」）
    needsComment: canComment(user, authz) && commentCount === 0,
  }
}
