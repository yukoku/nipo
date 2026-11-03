import 'server-only'

import type { Prisma, ReportStatus, Role } from '@/generated/prisma/client'
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/api/errors'

/**
 * 日報の権限判定（docs/api.md §4「共通：閲覧権限・編集可能条件・削除可能条件」、§5「コメント可能条件」）
 *
 * DB にはアクセスしない純粋な関数。判定に必要な情報は引数で受け取る。
 * API（services）と画面（ボタンを出すかどうか。R-03 の `permissions`）の両方がここを使い、判定を 1 か所にまとめる。
 *
 * | 操作 | 本人 | 直属の上長 | それ以外（他チームの上長・同僚・管理者） |
 * |---|---|---|---|
 * | 閲覧 | 常に可 | 提出済みだけ可 | 不可 |
 * | 編集 | 下書き、または提出済みでコメント 0 件 | 不可 | 不可 |
 * | 削除 | 下書きだけ | 不可 | 不可 |
 * | コメント | 不可 | 提出済みだけ可 | 不可 |
 *
 * - 管理者は日報を閲覧できない（決定事項 #7）
 * - 「直属の上長」は、日報を書いた人の上長（manager_id）がログインユーザーで、かつログインユーザーのロールが上長のとき
 *   （部下の部下の日報は見られない。決定事項 #1）
 */

/** 判定に使うログインユーザーの情報（`CurrentUser` をそのまま渡せる） */
export interface AuthzUser {
  id: number
  role: Role
}

/** 判定に使う日報の情報 */
export interface AuthzReport {
  /** 日報を書いた営業の ID */
  salesStaffId: number
  /** 日報を書いた営業の上長の ID（いなければ null） */
  authorManagerId: number | null
  status: ReportStatus
  /** コメントの件数 */
  commentCount: number
}

/** 日報に対する操作 */
export type ReportAction = 'view' | 'edit' | 'delete' | 'comment'

/** R-03 の `permissions`（画面のボタンを出すかどうか） */
export interface ReportPermissions {
  canEdit: boolean
  canDelete: boolean
  canComment: boolean
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

/** 日報を閲覧できるか（U-01） */
export function canViewReport(user: AuthzUser, report: AuthzReport): boolean {
  if (user.role === 'ADMIN') {
    return false
  }
  return isAuthor(user, report) || (isDirectManager(user, report) && report.status === 'SUBMITTED')
}

/** 日報を編集できるか（U-02）。本人で、かつ下書き、または提出済みでコメントが 0 件 */
export function canEditReport(user: AuthzUser, report: AuthzReport): boolean {
  return isAuthor(user, report) && (report.status === 'DRAFT' || report.commentCount === 0)
}

/** 日報を削除できるか（U-02）。本人の下書きだけ（決定事項 #13） */
export function canDeleteReport(user: AuthzUser, report: AuthzReport): boolean {
  return isAuthor(user, report) && report.status === 'DRAFT'
}

/** 日報にコメントできるか（U-03）。直属の上長で、かつ提出済み */
export function canComment(user: AuthzUser, report: AuthzReport): boolean {
  return isDirectManager(user, report) && report.status === 'SUBMITTED'
}

/** 操作ごとの判定 */
export function canPerform(user: AuthzUser, report: AuthzReport, action: ReportAction): boolean {
  switch (action) {
    case 'view':
      return canViewReport(user, report)
    case 'edit':
      return canEditReport(user, report)
    case 'delete':
      return canDeleteReport(user, report)
    case 'comment':
      return canComment(user, report)
  }
}

/** R-03 の `permissions` を作る */
export function reportPermissions(user: AuthzUser, report: AuthzReport): ReportPermissions {
  return {
    canEdit: canEditReport(user, report),
    canDelete: canDeleteReport(user, report),
    canComment: canComment(user, report),
  }
}

// ---------------------------------------------------------------------------
// API 用のヘルパー（404 と 403 の使い分け。docs/api.md §1.5）
// ---------------------------------------------------------------------------

/**
 * 日報への操作が許されているか確かめる。許されていなければ例外を投げる。
 *
 * - 日報がない、または閲覧できない → `NotFoundError`（404）。閲覧できない日報の存在を推測させないため、「ない」と同じにする
 * - 閲覧はできるが、その操作はできない → `ForbiddenError`（403）
 *
 * @example
 * const report = await findReportForAuthz(id)        // なければ null
 * requireReportAccess(user, report, 'edit')          // 以降、report は null ではない
 */
export function requireReportAccess<T extends AuthzReport>(
  user: AuthzUser,
  report: T | null,
  action: ReportAction,
): asserts report is T {
  if (report === null || !canViewReport(user, report)) {
    throw new NotFoundError()
  }
  if (!canPerform(user, report, action)) {
    throw new ForbiddenError()
  }
}

/**
 * 日報を更新（R-04）できるか確かめる。できなければ例外を投げる。
 *
 * - 日報がない、または閲覧できない → `NotFoundError`（404）
 * - 閲覧はできるが本人ではない（上長など） → `ForbiddenError`（403。T-RPT-64）
 * - 本人だが、コメントが付いていて編集できない → `ConflictError`（409 `REPORT_LOCKED`。T-RPT-63・決定事項 #4）
 *
 * 決定事項 #15 のとおり、日報の行をロックしてから読み込んだ値を渡す
 */
export function requireReportEditable<T extends AuthzReport>(user: AuthzUser, report: T | null): asserts report is T {
  requireReportAccess(user, report, 'view')
  if (!isAuthor(user, report)) {
    throw new ForbiddenError()
  }
  if (!canEditReport(user, report)) {
    throw new ConflictError('REPORT_LOCKED')
  }
}

// ---------------------------------------------------------------------------
// 一覧用（R-01）
// ---------------------------------------------------------------------------

/**
 * 閲覧できる日報だけに絞り込む Prisma の where 条件（R-01）。`canViewReport` と同じ規則にする
 * （同じであることは src/server/authz/report.api.test.ts でテスト用DB を使って確かめている）
 */
export function viewableReportsWhere(user: AuthzUser): Prisma.DailyReportWhereInput {
  if (user.role === 'ADMIN') {
    // 何にも一致しない条件（管理者は日報を閲覧できない）
    return { id: { in: [] } }
  }
  const own: Prisma.DailyReportWhereInput = { salesStaffId: user.id }
  if (user.role !== 'MANAGER') {
    return own
  }
  return {
    OR: [own, { status: 'SUBMITTED', salesStaff: { managerId: user.id } }],
  }
}

/**
 * 一覧（R-01）を担当者（`sales_staff_id`）で絞り込めるか。自分か、直属の部下（無効になった部下も含む。決定事項 #16）だけ。
 * 指定された担当者がいない（`staff` が null）ときも false（存在を推測させないため、権限がないのと同じ 403 にする）
 */
export function canFilterReportsByStaff(user: AuthzUser, staff: { id: number; managerId: number | null } | null): boolean {
  if (staff === null || user.role === 'ADMIN') {
    return false
  }
  return staff.id === user.id || (user.role === 'MANAGER' && staff.managerId === user.id)
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

function isAuthor(user: AuthzUser, report: AuthzReport): boolean {
  return report.salesStaffId === user.id
}

function isDirectManager(user: AuthzUser, report: AuthzReport): boolean {
  return user.role === 'MANAGER' && report.authorManagerId === user.id
}
