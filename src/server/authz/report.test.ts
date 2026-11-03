import { describe, expect, it } from 'vitest'

import { ConflictError, ForbiddenError, NotFoundError } from '@/server/api/errors'

import {
  type AuthzReport,
  type AuthzUser,
  type ReportAction,
  canComment,
  canModifyComment,
  canDeleteReport,
  canFilterReportsByStaff,
  canEditReport,
  canPerform,
  canViewReport,
  reportPermissions,
  requireReportAccess,
  requireCommentOwner,
  requireReportEditable,
  viewableReportsWhere,
} from './report'

// テストデータ（docs/test-spec.md §2.2）と同じ関係：山田（営業）の上長は鈴木。田中は別チームの上長、佐藤は山田の同僚
const AUTHOR: AuthzUser = { id: 2, role: 'SALES' } // 山田（日報を書いた本人）
const MANAGER: AuthzUser = { id: 1, role: 'MANAGER' } // 鈴木（直属の上長）
const OTHER_MANAGER: AuthzUser = { id: 4, role: 'MANAGER' } // 田中（他チームの上長）
const COLLEAGUE: AuthzUser = { id: 3, role: 'SALES' } // 佐藤（同僚）
const ADMIN: AuthzUser = { id: 6, role: 'ADMIN' } // 管理者

const report = (status: AuthzReport['status'], commentCount: number): AuthzReport => ({
  salesStaffId: AUTHOR.id,
  authorManagerId: MANAGER.id,
  status,
  commentCount,
})

const DRAFT = report('DRAFT', 0)
const SUBMITTED = report('SUBMITTED', 0)
const COMMENTED = report('SUBMITTED', 1)

type Expected = {
  view: boolean
  edit: boolean
  delete: boolean
  comment: boolean
}
const NONE: Expected = {
  view: false,
  edit: false,
  delete: false,
  comment: false,
}

/**
 * U-01〜U-03：立場 × 日報の状態の全組み合わせと、期待する判定（docs/api.md §4・§5）
 */
const MATRIX: [string, AuthzUser, string, AuthzReport, Expected][] = [
  // 本人：常に閲覧可。編集は下書きか、提出済みでコメント 0 件。削除は下書きだけ。コメントは不可
  ['本人', AUTHOR, '下書き', DRAFT, { view: true, edit: true, delete: true, comment: false }],
  ['本人', AUTHOR, '提出済み（コメントなし）', SUBMITTED, { view: true, edit: true, delete: false, comment: false }],
  ['本人', AUTHOR, '提出済み（コメントあり）', COMMENTED, { view: true, edit: false, delete: false, comment: false }],
  // 直属の上長：提出済みだけ閲覧・コメント可。下書きは見えない。編集・削除は不可
  ['直属の上長', MANAGER, '下書き', DRAFT, NONE],
  [
    '直属の上長',
    MANAGER,
    '提出済み（コメントなし）',
    SUBMITTED,
    { view: true, edit: false, delete: false, comment: true },
  ],
  [
    '直属の上長',
    MANAGER,
    '提出済み（コメントあり）',
    COMMENTED,
    { view: true, edit: false, delete: false, comment: true },
  ],
  // 他チームの上長・同僚・管理者：何もできない
  ['他チームの上長', OTHER_MANAGER, '下書き', DRAFT, NONE],
  ['他チームの上長', OTHER_MANAGER, '提出済み（コメントなし）', SUBMITTED, NONE],
  ['他チームの上長', OTHER_MANAGER, '提出済み（コメントあり）', COMMENTED, NONE],
  ['同僚', COLLEAGUE, '下書き', DRAFT, NONE],
  ['同僚', COLLEAGUE, '提出済み（コメントなし）', SUBMITTED, NONE],
  ['同僚', COLLEAGUE, '提出済み（コメントあり）', COMMENTED, NONE],
  ['管理者', ADMIN, '下書き', DRAFT, NONE],
  ['管理者', ADMIN, '提出済み（コメントなし）', SUBMITTED, NONE],
  ['管理者', ADMIN, '提出済み（コメントあり）', COMMENTED, NONE],
]

describe.each(MATRIX)('%s × %s', (_who, user, _state, target, expected) => {
  it(`U-01 閲覧：${expected.view ? '可' : '不可'}`, () => {
    expect(canViewReport(user, target)).toBe(expected.view)
  })

  it(`U-02 編集：${expected.edit ? '可' : '不可'}／削除：${expected.delete ? '可' : '不可'}`, () => {
    expect(canEditReport(user, target)).toBe(expected.edit)
    expect(canDeleteReport(user, target)).toBe(expected.delete)
  })

  it(`U-03 コメント：${expected.comment ? '可' : '不可'}`, () => {
    expect(canComment(user, target)).toBe(expected.comment)
  })

  it('canPerform・reportPermissions も同じ判定を返す', () => {
    for (const action of ['view', 'edit', 'delete', 'comment'] as const) {
      expect(canPerform(user, target, action)).toBe(expected[action])
    }
    expect(reportPermissions(user, target)).toEqual({
      canEdit: expected.edit,
      canDelete: expected.delete,
      canComment: expected.comment,
    })
  })
})

describe('立場の判定の細かい規則', () => {
  it('部下の部下の日報は見られない（直属の上長だけ。決定事項 #1）', () => {
    // 鈴木の上長が田中だったとしても、田中から山田（鈴木の部下）の日報は見えない
    expect(canViewReport(OTHER_MANAGER, SUBMITTED)).toBe(false)
  })

  it('上長のロールでない人は、manager_id が自分でも上長として扱わない（ロール変更後にデータが残った場合の防御）', () => {
    const formerManager: AuthzUser = { id: MANAGER.id, role: 'SALES' }

    expect(canViewReport(formerManager, SUBMITTED)).toBe(false)
    expect(canComment(formerManager, SUBMITTED)).toBe(false)
  })

  it('上長も自分の日報は本人として扱う（上長も日報を書く）', () => {
    const own: AuthzReport = {
      salesStaffId: MANAGER.id,
      authorManagerId: null,
      status: 'DRAFT',
      commentCount: 0,
    }

    expect(reportPermissions(MANAGER, own)).toEqual({
      canEdit: true,
      canDelete: true,
      canComment: false,
    })
    expect(canViewReport(MANAGER, own)).toBe(true)
  })

  it('上長がいない営業の日報は、本人以外は見られない', () => {
    const noManager: AuthzReport = { ...SUBMITTED, authorManagerId: null }

    expect(canViewReport(MANAGER, noManager)).toBe(false)
  })
})

describe('requireReportAccess（404 と 403 の使い分け。docs/api.md §1.5）', () => {
  const run = (user: AuthzUser, target: AuthzReport | null, action: ReportAction) => () =>
    requireReportAccess(user, target, action)

  it('日報がなければ 404', () => {
    expect(run(AUTHOR, null, 'view')).toThrow(NotFoundError)
  })

  it('閲覧できない日報は、どの操作でも 404（存在を推測させない）', () => {
    for (const action of ['view', 'edit', 'delete', 'comment'] as const) {
      expect(run(COLLEAGUE, SUBMITTED, action)).toThrow(NotFoundError)
      expect(run(MANAGER, DRAFT, action)).toThrow(NotFoundError)
    }
  })

  it('閲覧はできるが、その操作はできなければ 403', () => {
    expect(run(MANAGER, SUBMITTED, 'edit')).toThrow(ForbiddenError) // T-RPT-64
    expect(run(MANAGER, SUBMITTED, 'delete')).toThrow(ForbiddenError) // T-RPT-83
    expect(run(AUTHOR, SUBMITTED, 'comment')).toThrow(ForbiddenError) // T-CMT-05
    expect(run(AUTHOR, SUBMITTED, 'delete')).toThrow(ForbiddenError)
  })

  it('許されていれば何も投げない', () => {
    expect(run(AUTHOR, DRAFT, 'delete')).not.toThrow()
    expect(run(MANAGER, SUBMITTED, 'comment')).not.toThrow()
  })
})

describe('viewableReportsWhere', () => {
  it('営業は自分の日報だけ', () => {
    expect(viewableReportsWhere(AUTHOR)).toEqual({ salesStaffId: AUTHOR.id })
  })

  it('上長は自分の日報と、直属の部下の提出済みの日報', () => {
    expect(viewableReportsWhere(MANAGER)).toEqual({
      OR: [{ salesStaffId: MANAGER.id }, { status: 'SUBMITTED', salesStaff: { managerId: MANAGER.id } }],
    })
  })

  it('管理者は何にも一致しない条件', () => {
    expect(viewableReportsWhere(ADMIN)).toEqual({ id: { in: [] } })
  })
})

describe('canFilterReportsByStaff（R-01 の sales_staff_id）', () => {
  const yamada = { id: AUTHOR.id, managerId: MANAGER.id }
  const suzuki = { id: MANAGER.id, managerId: null }
  const ito = { id: 5, managerId: OTHER_MANAGER.id }

  it('自分は指定できる（営業・上長）', () => {
    expect(canFilterReportsByStaff(AUTHOR, yamada)).toBe(true)
    expect(canFilterReportsByStaff(MANAGER, suzuki)).toBe(true)
  })

  it('上長は直属の部下を指定できる（無効になった部下も含む。決定事項 #16）', () => {
    expect(canFilterReportsByStaff(MANAGER, yamada)).toBe(true)
  })

  it('T-RPT-23・24: 他チームの人・同僚・上長は指定できない', () => {
    expect(canFilterReportsByStaff(MANAGER, ito)).toBe(false)
    expect(canFilterReportsByStaff(COLLEAGUE, yamada)).toBe(false)
    expect(canFilterReportsByStaff(AUTHOR, suzuki)).toBe(false)
  })

  it('営業は、自分の部下という関係があっても（データの誤りなど）他人を指定できない', () => {
    expect(canFilterReportsByStaff(COLLEAGUE, { id: 9, managerId: COLLEAGUE.id })).toBe(false)
  })

  it('管理者は自分を指定しても不可。存在しない担当者（null）も不可', () => {
    expect(canFilterReportsByStaff(ADMIN, { id: ADMIN.id, managerId: null })).toBe(false)
    expect(canFilterReportsByStaff(MANAGER, null)).toBe(false)
  })
})

describe('requireReportEditable（R-04 の 404・403・409 の使い分け）', () => {
  it('本人の下書き・コメントのない提出済み日報は、例外を投げない', () => {
    expect(() => requireReportEditable(AUTHOR, DRAFT)).not.toThrow()
    expect(() => requireReportEditable(AUTHOR, SUBMITTED)).not.toThrow()
  })

  it('日報がない・閲覧できない（同僚・他チームの上長・管理者・部下の下書きを見る上長）は 404', () => {
    expect(() => requireReportEditable(AUTHOR, null)).toThrow(NotFoundError)
    expect(() => requireReportEditable(COLLEAGUE, SUBMITTED)).toThrow(NotFoundError)
    expect(() => requireReportEditable(OTHER_MANAGER, SUBMITTED)).toThrow(NotFoundError)
    expect(() => requireReportEditable(ADMIN, SUBMITTED)).toThrow(NotFoundError)
    expect(() => requireReportEditable(MANAGER, DRAFT)).toThrow(NotFoundError)
  })

  it('T-RPT-64: 閲覧はできるが本人ではない上長は 403', () => {
    expect(() => requireReportEditable(MANAGER, SUBMITTED)).toThrow(ForbiddenError)
    // コメントが付いていても、本人でなければ 409 ではなく 403
    expect(() => requireReportEditable(MANAGER, COMMENTED)).toThrow(ForbiddenError)
  })

  it('T-RPT-63: 本人でも、コメントが付いた日報は 409 REPORT_LOCKED', () => {
    expect(() => requireReportEditable(AUTHOR, COMMENTED)).toThrow(ConflictError)
    expect(() => requireReportEditable(AUTHOR, COMMENTED)).toThrow(expect.objectContaining({ reason: 'REPORT_LOCKED' }))
  })
})

describe('requireCommentOwner（C-02・C-03 の 404 と 403 の使い分け）', () => {
  const comment = { commenterId: MANAGER.id }

  it('投稿した本人だけが更新・削除できる', () => {
    expect(canModifyComment(MANAGER, comment)).toBe(true)
    expect(canModifyComment(OTHER_MANAGER, comment)).toBe(false)
    expect(() => requireCommentOwner(MANAGER, comment, SUBMITTED)).not.toThrow()
  })

  it('コメントがなければ 404', () => {
    expect(() => requireCommentOwner(MANAGER, null, SUBMITTED)).toThrow(NotFoundError)
  })

  it('T-CMT-14: 日報を閲覧できない人（他チームの上長・同僚・管理者）は 404', () => {
    for (const user of [OTHER_MANAGER, COLLEAGUE, ADMIN]) {
      expect(() => requireCommentOwner(user, comment, SUBMITTED)).toThrow(NotFoundError)
    }
  })

  it('T-CMT-14: 日報を閲覧できるが投稿者ではない人（日報を書いた本人）は 403', () => {
    expect(() => requireCommentOwner(AUTHOR, comment, SUBMITTED)).toThrow(ForbiddenError)
  })
})
