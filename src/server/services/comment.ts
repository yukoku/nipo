import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { CamelCaseKeys } from '@/lib/case'
import type { CommentCreateRequest, CommentTarget, CommentUpdateRequest } from '@/schemas/comment'
import { requireCommentOwner, requireReportAccess } from '@/server/authz/report'
import type { AuthzUser } from '@/server/authz/report'
import { prisma } from '@/server/db/prisma'

/** コメントオブジェクト（docs/api.md §4「日報オブジェクト」の `comments[]`。services の形） */
export interface CommentView {
  id: number
  target: CommentTarget
  body: string
  commenter: { id: number; name: string }
  createdAt: Date
  updatedAt: Date
}

export type CommentCreateInput = CamelCaseKeys<CommentCreateRequest>
export type CommentUpdateInput = CamelCaseKeys<CommentUpdateRequest>

const commentSelect = {
  id: true,
  target: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  commenter: { select: { id: true, name: true } },
} satisfies Prisma.CommentSelect

/** 権限の判定に使う日報の項目 */
const authzReportSelect = {
  salesStaffId: true,
  status: true,
  salesStaff: { select: { managerId: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.DailyReportSelect

type AuthzReportRow = Prisma.DailyReportGetPayload<{ select: typeof authzReportSelect }>

/**
 * C-01 コメント投稿（docs/api.md §5）。
 *
 * - 日報を書いた人の直属の上長で、日報が提出済みのときだけ投稿できる
 * - 閲覧できない・ない日報は 404、閲覧はできるがコメントできない（日報を書いた本人など）は 403
 * - 日報の行をロック（`SELECT ... FOR UPDATE`）してから判定・作成する（決定事項 #15）。日報の更新（R-04）も同じ行をロックするため、
 *   「コメントの確認をすり抜けて、コメントが付いた日報の内容が書き換わる」ことは起きない
 */
export async function createComment(
  user: AuthzUser,
  reportId: number,
  input: CommentCreateInput,
): Promise<CommentView> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM daily_reports WHERE id = ${reportId} FOR UPDATE`
    const report = await tx.dailyReport.findUnique({ where: { id: reportId }, select: authzReportSelect })
    requireReportAccess(user, toAuthzReport(report), 'comment')

    const row = await tx.comment.create({
      data: { dailyReportId: reportId, commenterId: user.id, target: toDbTarget(input.target), body: input.body },
      select: commentSelect,
    })
    return toCommentView(row)
  })
}

/**
 * C-02 コメント更新（docs/api.md §5）。投稿した本人だけ。`target` は変えない（T-CMT-13）。
 * コメントがない・日報を閲覧できないときは 404、投稿者以外は 403（T-CMT-14）
 */
export async function updateComment(user: AuthzUser, id: number, input: CommentUpdateInput): Promise<CommentView> {
  await requireOwnComment(user, id)
  const row = await prisma.comment.update({ where: { id }, data: { body: input.body }, select: commentSelect })
  return toCommentView(row)
}

/**
 * C-03 コメント削除（docs/api.md §5）。投稿した本人だけ。物理削除（決定事項 #14）。
 * コメントが 0 件になった日報は、また編集できるようになる（T-RPT-69）
 */
export async function deleteComment(user: AuthzUser, id: number): Promise<void> {
  await requireOwnComment(user, id)
  await prisma.comment.delete({ where: { id } })
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

/** 自分が投稿したコメントか確かめる。コメントがない・日報を閲覧できないなら 404、投稿者以外は 403 */
async function requireOwnComment(user: AuthzUser, id: number): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: { commenterId: true, dailyReport: { select: authzReportSelect } },
  })
  requireCommentOwner(user, comment, toAuthzReport(comment?.dailyReport ?? null))
}

function toAuthzReport(row: AuthzReportRow | null) {
  if (row === null) {
    return null
  }
  return {
    salesStaffId: row.salesStaffId,
    authorManagerId: row.salesStaff.managerId,
    status: row.status,
    commentCount: row._count.comments,
  }
}

function toDbTarget(target: CommentTarget) {
  return target === 'problem' ? 'PROBLEM' : 'PLAN'
}

function toCommentView(row: Prisma.CommentGetPayload<{ select: typeof commentSelect }>): CommentView {
  return { ...row, target: row.target === 'PROBLEM' ? 'problem' : 'plan' }
}
