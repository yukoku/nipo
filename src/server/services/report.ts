import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { CamelCaseKeys } from '@/lib/case'
import { dateStringToDbDate, dbDateToDateString, dbTimeToTimeString, timeStringToDbTime } from '@/lib/date'
import type { PageMeta } from '@/schemas/pagination'
import type { ReportCreateRequest, ReportListQuery, ReportStatus, ReportUpdateRequest } from '@/schemas/report'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/server/api/errors'
import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import {
  type AuthzUser,
  type ReportPermissions,
  canComment,
  canFilterReportsByStaff,
  reportPermissions,
  requireReportAccess,
  requireReportEditable,
  viewableReportsWhere,
} from '@/server/authz/report'
import { requireRole } from '@/server/authz/role'
import { prisma } from '@/server/db/prisma'
import { planVisitRecordChanges } from '@/server/services/visit-record-changes'

export type ReportListInput = CamelCaseKeys<ReportListQuery>
export type ReportCreateInput = CamelCaseKeys<ReportCreateRequest>
export type ReportUpdateInput = CamelCaseKeys<ReportUpdateRequest>

/** 提出済みの日報を下書きに戻そうとしたときのメッセージ（T-RPT-65） */
export const CANNOT_REVERT_TO_DRAFT_MESSAGE = '提出済みの日報は下書きに戻せません'

/** 他の日報の訪問記録・存在しない訪問記録の id を指定したときのメッセージ（T-RPT-68） */
export const UNKNOWN_VISIT_RECORD_MESSAGE = 'この日報の訪問記録ではありません'

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
  await requireReportListAccess(user, query.salesStaffId)

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

/**
 * 日報一覧（R-01・SC-02）を見られるか確かめる。管理者は 403。
 * `salesStaffId` を指定したときは、自分か直属の部下（無効になった部下も含む）でなければ 403（存在しない ID も 403）。
 * 画面では、一覧の読み込み（ストリーミング）を始める前に呼び、403 のステータスを正しく返す
 */
export async function requireReportListAccess(user: AuthzUser, salesStaffId?: number): Promise<void> {
  requireRole(user, 'SALES', 'MANAGER')
  if (salesStaffId === undefined) {
    return
  }
  const staff = await prisma.salesStaff.findUnique({ where: { id: salesStaffId }, select: { id: true, managerId: true } })
  if (!canFilterReportsByStaff(user, staff)) {
    throw new ForbiddenError()
  }
}

/**
 * 日報一覧（SC-02）の担当者セレクトに出す直属の部下（有効な人だけ。ID の順）。上長以外は空。
 * 選択肢の「全員」「自分」は画面で足す（docs/screens.md SC-02・T-UI-04）
 */
export async function listReportSubordinateOptions(user: AuthzUser): Promise<{ id: number; name: string }[]> {
  requireRole(user, 'SALES', 'MANAGER')
  if (user.role !== 'MANAGER') {
    return []
  }
  return prisma.salesStaff.findMany({
    where: { managerId: user.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })
}

/** ログインユーザー自身の、指定した日付の日報の ID（なければ null）。SC-02 の「今日の日報を書く」に使う */
export async function findOwnReportId(user: AuthzUser, reportDate: string): Promise<number | null> {
  requireRole(user, 'SALES', 'MANAGER')
  const report = await prisma.dailyReport.findUnique({
    where: { salesStaffId_reportDate: { salesStaffId: user.id, reportDate: dateStringToDbDate(reportDate) } },
    select: { id: true },
  })
  return report?.id ?? null
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
// R-04 日報更新
// ---------------------------------------------------------------------------

/**
 * R-04 日報更新（docs/api.md §4）。
 *
 * - 日報の行をロック（`SELECT ... FOR UPDATE`）してから読み込み、その値で判定する（決定事項 #15）。
 *   コメントの投稿（C-01）も同じ行をロックするため、「コメントが付いたのに内容が書き換わる」ことは起きない
 * - 閲覧できない・ない日報は 404、本人以外は 403、コメントが付いていれば 409 `REPORT_LOCKED`
 * - 提出済みを下書きに戻すのは 400。`submitted_at` は初めて提出したときだけ入れる
 * - 訪問記録は全件置き換え（`planVisitRecordChanges()`）。他の日報の訪問記録の `id` は 400（T-RPT-68）
 * - 顧客は有効であること。ただし、既存の行で顧客を変えていなければ確かめない（決定事項 #36）
 * - 報告日は変えない（スキーマで取り除く。T-RPT-66）
 */
export async function updateReport(user: AuthzUser, id: number, input: ReportUpdateInput): Promise<ReportView> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM daily_reports WHERE id = ${id} FOR UPDATE`
    const current = await tx.dailyReport.findUnique({
      where: { id },
      select: {
        salesStaffId: true,
        status: true,
        submittedAt: true,
        salesStaff: { select: { managerId: true } },
        visitRecords: { select: { id: true, customerId: true } },
        _count: { select: { comments: true } },
      },
    })
    if (current === null) {
      throw new NotFoundError()
    }
    // 閲覧できなければ 404、本人以外は 403、コメントが付いていれば 409 REPORT_LOCKED
    requireReportEditable(user, {
      salesStaffId: current.salesStaffId,
      authorManagerId: current.salesStaff.managerId,
      status: current.status,
      commentCount: current._count.comments,
    })
    if (current.status === 'SUBMITTED' && input.status === 'draft') {
      throw ValidationError.forField('status', CANNOT_REVERT_TO_DRAFT_MESSAGE)
    }

    const changes = planVisitRecordChanges(
      current.visitRecords.map((record) => record.id),
      input.visitRecords.map(({ id: recordId, ...data }) => ({ id: recordId, data })),
    )
    if (changes.unknownIdIndexes.length > 0) {
      throw new ValidationError(
        changes.unknownIdIndexes.map((index) => ({ field: `visit_records[${index}].id`, message: UNKNOWN_VISIT_RECORD_MESSAGE })),
      )
    }
    const currentCustomerOf = new Map(current.visitRecords.map((record) => [record.id, record.customerId]))
    await assertActiveCustomersAt(
      tx,
      input.visitRecords.flatMap((record, index) =>
        record.id !== undefined && currentCustomerOf.get(record.id) === record.customerId
          ? []
          : [{ index, customerId: record.customerId }],
      ),
    )

    if (changes.deleteIds.length > 0) {
      await tx.visitRecord.deleteMany({ where: { id: { in: changes.deleteIds }, dailyReportId: id } })
    }
    for (const update of changes.updates) {
      await tx.visitRecord.update({
        where: { id: update.id },
        data: { ...toVisitRecordData(update.data), sortOrder: update.sortOrder },
      })
    }
    if (changes.creates.length > 0) {
      await tx.visitRecord.createMany({
        data: changes.creates.map((create) => ({
          ...toVisitRecordData(create.data),
          sortOrder: create.sortOrder,
          dailyReportId: id,
        })),
      })
    }
    const submitted = input.status === 'submitted'
    await tx.dailyReport.update({
      where: { id },
      data: {
        status: submitted ? 'SUBMITTED' : 'DRAFT',
        problem: input.problem,
        plan: input.plan,
        // 初めて提出したときだけ提出日時を入れる（T-RPT-67）
        ...(submitted && current.submittedAt === null && { submittedAt: new Date() }),
      },
    })
  })
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
 * R-03 日報詳細（docs/api.md §4）。
 *
 * - 本人は自分の日報（下書きを含む）、上長は直属の部下の提出済み日報だけ閲覧できる
 * - 日報がない・閲覧できないときは、どちらも同じ 404（存在を推測させない。T-RPT-43〜46）。管理者も 404（決定事項 #7）
 * - 顧客が無効になっていても、訪問記録の顧客名はそのまま返す（T-CUS-09）
 */
export async function getReport(user: AuthzUser, id: number): Promise<ReportView> {
  const row = await prisma.dailyReport.findUnique({ where: { id }, select: reportSelect })
  if (row === null) {
    throw new NotFoundError()
  }
  // 閲覧できなければ、ないのと同じ NotFoundError（404）
  requireReportAccess(user, toAuthzReport(row), 'view')
  return toReportView(user, row)
}

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
    permissions: reportPermissions(user, toAuthzReport(row)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 権限の判定に使う形にする */
function toAuthzReport(row: ReportRow) {
  return {
    salesStaffId: row.salesStaffId,
    authorManagerId: row.salesStaff.managerId,
    status: row.status,
    commentCount: row.comments.length,
  }
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient

/** 訪問記録の顧客が、すべて存在して有効なことを確かめる。違う行があれば、その行の `customer_id` のエラー（400） */
async function assertActiveCustomers(records: readonly { customerId: number }[]): Promise<void> {
  await assertActiveCustomersAt(
    prisma,
    records.map((record, index) => ({ index, customerId: record.customerId })),
  )
}

/**
 * 指定した行の顧客が、存在して有効なことを確かめる。違う行があれば、その行（`index` は送られてきた配列の位置）の
 * `customer_id` のエラー（400）
 */
async function assertActiveCustomersAt(db: Db, rows: readonly { index: number; customerId: number }[]): Promise<void> {
  if (rows.length === 0) {
    return
  }
  const ids = [...new Set(rows.map((row) => row.customerId))]
  const active = await db.customer.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
  const activeIds = new Set(active.map((customer) => customer.id))
  const details = rows.flatMap((row) =>
    activeIds.has(row.customerId)
      ? []
      : [{ field: `visit_records[${row.index}].customer_id`, message: INVALID_CUSTOMER_MESSAGE }],
  )
  if (details.length > 0) {
    throw new ValidationError(details)
  }
}

/** 訪問記録を DB に保存する形にする。`sort_order` は配列の順に 1 から */
function toVisitRecordRows(records: ReportCreateInput['visitRecords']) {
  return records.map((record, index) => ({ ...toVisitRecordData(record), sortOrder: index + 1 }))
}

/** 訪問記録の 1 行を DB に保存する形にする（`sort_order` 以外） */
function toVisitRecordData(record: { customerId: number; visitedAt: string | null; content: string }) {
  return {
    customerId: record.customerId,
    visitedAt: record.visitedAt === null ? null : timeStringToDbTime(record.visitedAt),
    content: record.content,
  }
}
