import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { CamelCaseKeys } from '@/lib/case'
import { dateStringToDbDate, dbDateToDateString, dbTimeToTimeString, timeStringToDbTime } from '@/lib/date'
import type { PageMeta } from '@/schemas/pagination'
import type { ReportCreateRequest, ReportListQuery, ReportStatus } from '@/schemas/report'
import { ConflictError, ForbiddenError, ValidationError } from '@/server/api/errors'
import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import {
  type AuthzUser,
  type ReportPermissions,
  canComment,
  canFilterReportsByStaff,
  reportPermissions,
  viewableReportsWhere,
} from '@/server/authz/report'
import { requireRole } from '@/server/authz/role'
import { prisma } from '@/server/db/prisma'

export type ReportListInput = CamelCaseKeys<ReportListQuery>
export type ReportCreateInput = CamelCaseKeys<ReportCreateRequest>

/** 訪問記録の顧客が、ない・無効なときのメッセージ（T-RPT-10・11・T-CUS-10） */
export const INVALID_CUSTOMER_MESSAGE = '顧客には有効な顧客を選択してください'

/** 日報オブジェクト（docs/api.md §4 共通。services の形。API の形への変換は response で行う） */
export interface ReportView {
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
    sortOrder: number
  }[]
  comments: {
    id: number
    target: 'problem' | 'plan'
    body: string
    commenter: { id: number; name: string }
    createdAt: Date
    updatedAt: Date
  }[]
  permissions: ReportPermissions
  createdAt: Date
  updatedAt: Date
}

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

// ---------------------------------------------------------------------------
// R-02 日報作成
// ---------------------------------------------------------------------------

/**
 * R-02 日報作成（docs/api.md §4）。
 *
 * - 担当者はログインユーザーで固定する（リクエストでは指定できない。T-RPT-15）。管理者は 403（T-RPT-16）
 * - 訪問記録の顧客は、存在して有効であること（T-RPT-10・11）
 * - 同じ担当者・同じ日付の日報があれば 409 `REPORT_ALREADY_EXISTS`（T-RPT-03）。
 *   同時に作成された場合（ボタンの 2 度押しなど）の一意制約違反も 409 にする
 * - 日報と訪問記録は 1 つのトランザクションで作る。`sort_order` は配列の順に 1 から振る
 * - 提出なら `submitted_at` に現在日時を入れる
 */
export async function createReport(user: AuthzUser, input: ReportCreateInput): Promise<ReportView> {
  requireRole(user, 'SALES', 'MANAGER')
  await assertActiveCustomers(input.visitRecords)
  const reportDate = dateStringToDbDate(input.reportDate)
  const existing = await prisma.dailyReport.findUnique({
    where: { salesStaffId_reportDate: { salesStaffId: user.id, reportDate } },
    select: { id: true },
  })
  if (existing !== null) {
    throw new ConflictError('REPORT_ALREADY_EXISTS')
  }

  const submitted = input.status === 'submitted'
  let id: number
  try {
    ;({ id } = await prisma.dailyReport.create({
      data: {
        salesStaffId: user.id,
        reportDate,
        status: submitted ? 'SUBMITTED' : 'DRAFT',
        submittedAt: submitted ? new Date() : null,
        problem: input.problem,
        plan: input.plan,
        // 日報と訪問記録は 1 つの SQL の流れ（ネストした作成）で作られ、Prisma がトランザクションにまとめる
        visitRecords: { create: toVisitRecordRows(input.visitRecords) },
      },
      select: { id: true },
    }))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('REPORT_ALREADY_EXISTS')
    }
    throw error
  }
  return getReportView(user, id)
}

// ---------------------------------------------------------------------------
// 日報オブジェクト（R-02〜R-04 のレスポンス）
// ---------------------------------------------------------------------------

const reportSelect = {
  id: true,
  reportDate: true,
  status: true,
  submittedAt: true,
  problem: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
  salesStaffId: true,
  salesStaff: { select: { id: true, name: true, managerId: true } },
  visitRecords: {
    select: { id: true, visitedAt: true, content: true, sortOrder: true, customer: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
  comments: {
    select: {
      id: true,
      target: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      commenter: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.DailyReportSelect

type ReportRow = Prisma.DailyReportGetPayload<{ select: typeof reportSelect }>

/**
 * 日報オブジェクトを読み込む。権限の確認はしない（呼び出し側で確かめた日報だけに使う）。
 * `permissions` はログインユーザーから見た値にする
 */
async function getReportView(user: AuthzUser, id: number): Promise<ReportView> {
  const row = await prisma.dailyReport.findUniqueOrThrow({ where: { id }, select: reportSelect })
  return toReportView(user, row)
}

function toReportView(user: AuthzUser, row: ReportRow): ReportView {
  return {
    id: row.id,
    reportDate: dbDateToDateString(row.reportDate),
    salesStaff: { id: row.salesStaff.id, name: row.salesStaff.name },
    status: row.status === 'SUBMITTED' ? 'submitted' : 'draft',
    submittedAt: row.submittedAt,
    problem: row.problem,
    plan: row.plan,
    visitRecords: row.visitRecords.map((record) => ({
      id: record.id,
      customer: record.customer,
      visitedAt: record.visitedAt === null ? null : dbTimeToTimeString(record.visitedAt),
      content: record.content,
      sortOrder: record.sortOrder,
    })),
    comments: row.comments.map((comment) => ({
      ...comment,
      target: comment.target === 'PROBLEM' ? 'problem' : 'plan',
    })),
    permissions: reportPermissions(user, {
      salesStaffId: row.salesStaffId,
      authorManagerId: row.salesStaff.managerId,
      status: row.status,
      commentCount: row.comments.length,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

/** 訪問記録の顧客が、すべて存在して有効なことを確かめる。違う行があれば、その行の `customer_id` のエラー（400） */
async function assertActiveCustomers(records: readonly { customerId: number }[]): Promise<void> {
  const ids = records.map((record) => record.customerId)
  if (ids.length === 0) {
    return
  }
  const active = await prisma.customer.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
  const activeIds = new Set(active.map((customer) => customer.id))
  const details = ids.flatMap((id, index) =>
    activeIds.has(id) ? [] : [{ field: `visit_records[${index}].customer_id`, message: INVALID_CUSTOMER_MESSAGE }],
  )
  if (details.length > 0) {
    throw new ValidationError(details)
  }
}

/** 訪問記録を DB に保存する形にする。`sort_order` は配列の順に 1 から */
function toVisitRecordRows(records: ReportCreateInput['visitRecords']) {
  return records.map((record, index) => ({
    customerId: record.customerId,
    visitedAt: record.visitedAt === null ? null : timeStringToDbTime(record.visitedAt),
    content: record.content,
    sortOrder: index + 1,
  }))
}
