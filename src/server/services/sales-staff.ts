import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { Role } from '@/generated/prisma/client'
import type { CamelCaseKeys } from '@/lib/case'
import { fromApiRole } from '@/lib/roles'
import type { ApiRole } from '@/schemas/auth'
import type { PageMeta } from '@/schemas/pagination'
import type { StaffCreateRequest, StaffListQuery, StaffUpdateRequest } from '@/schemas/sales-staff'
import { ConflictError, NotFoundError, ValidationError } from '@/server/api/errors'
import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import { hashPassword } from '@/server/auth/password'
import { deleteSessionsForStaff } from '@/server/auth/session'
import type { AuthzUser } from '@/server/authz/report'
import { requireRole } from '@/server/authz/role'
import { prisma } from '@/server/db/prisma'
import { toApiRole } from '@/server/services/auth'
import { wouldCreateManagerCycle } from '@/server/services/manager-hierarchy'

/** 営業オブジェクト（docs/api.md §7。services の形。API の形への変換は response で行う）。パスワードは含めない */
export interface StaffView {
  id: number
  name: string
  email: string
  department: string | null
  role: ApiRole
  manager: { id: number; name: string } | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** S-03 営業詳細：営業オブジェクト ＋ 直属の部下の人数 */
export interface StaffDetailView extends StaffView {
  subordinateCount: number
}

export type StaffListInput = CamelCaseKeys<StaffListQuery>
export type StaffCreateInput = CamelCaseKeys<StaffCreateRequest>
export type StaffUpdateInput = CamelCaseKeys<StaffUpdateRequest>

export const STAFF_MESSAGES = {
  invalidManager: '上長には、権限が「上長」の有効な担当者を指定してください',
  managerCycle: '自分自身や自分の部下を上長にすることはできません',
  selfDeactivate: '自分自身を無効にすることはできません',
  selfRoleChange: '自分自身の権限は変更できません',
  hasSubordinates: 'この担当者には部下がいるため、権限を「上長」以外に変更できません。先に部下の上長を付け替えてください',
} as const

/** `password_hash` は選ばない（どの API でも返さない。docs/api.md §7） */
const staffSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  role: true,
  manager: { select: { id: true, name: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SalesStaffSelect

type StaffRow = Prisma.SalesStaffGetPayload<{ select: typeof staffSelect }>

function toView(row: StaffRow): StaffView {
  return { ...row, role: toApiRole(row.role) }
}

/**
 * S-01 営業一覧。部署の昇順（部署なしは最後）→ 氏名の昇順。
 * 管理者は全員、上長は自分と直属の部下だけ、営業は 403（docs/api.md §7）
 */
export async function listStaff(user: AuthzUser, query: StaffListInput): Promise<{ items: StaffView[]; meta: PageMeta }> {
  requireRole(user, 'ADMIN', 'MANAGER')
  const where: Prisma.SalesStaffWhereInput = {
    ...(user.role === 'MANAGER' && { OR: [{ id: user.id }, { managerId: user.id }] }),
    ...(query.name && { name: { contains: query.name, mode: 'insensitive' } }),
    ...(query.department && { department: query.department }),
    ...(query.role && { role: fromApiRole(query.role) }),
    ...(!query.includeInactive && { isActive: true }),
  }

  const [rows, totalCount] = await prisma.$transaction([
    prisma.salesStaff.findMany({
      where,
      select: staffSelect,
      orderBy: [{ department: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
      ...toPrismaPagination(query),
    }),
    prisma.salesStaff.count({ where }),
  ])
  return { items: rows.map(toView), meta: buildPageMeta(query, totalCount) }
}

/** S-02 営業登録（管理者のみ）。メールアドレスが重複していたら 409 `EMAIL_ALREADY_EXISTS` */
export async function createStaff(user: AuthzUser, input: StaffCreateInput): Promise<StaffView> {
  requireRole(user, 'ADMIN')
  await assertEmailAvailable(input.email)
  if (input.managerId !== null) {
    await assertAssignableManager(input.managerId)
  }

  const { password, role, ...rest } = input
  const passwordHash = await hashPassword(password)
  const row = await withEmailConflict(() =>
    prisma.salesStaff.create({ data: { ...rest, role: fromApiRole(role), passwordHash, isActive: true }, select: staffSelect }),
  )
  return toView(row)
}

/** S-03 営業詳細（管理者のみ）。なければ `NotFoundError`（404） */
export async function getStaff(user: AuthzUser, id: number): Promise<StaffDetailView> {
  requireRole(user, 'ADMIN')
  const row = await prisma.salesStaff.findUnique({ where: { id }, select: staffSelect })
  if (row === null) {
    throw new NotFoundError()
  }
  return { ...toView(row), subordinateCount: await countActiveSubordinates(id) }
}

/**
 * S-04 営業更新（管理者のみ）。全項目の置き換え（`password` だけは省略・空文字なら変更しない）。
 *
 * - 管理者は自分自身を無効にしたり、自分の権限を変えたりできない（400）
 * - 上長は有効な上長（manager）だけ。自分自身や自分の配下は指定できない（400。U-06）
 * - 有効な部下がいる人の権限を「上長」以外に変えるのは 409
 * - 無効にしたら、その人のセッションをすべて削除する（T-AUTH-10）
 */
export async function updateStaff(user: AuthzUser, id: number, input: StaffUpdateInput): Promise<StaffView> {
  requireRole(user, 'ADMIN')
  const current = await prisma.salesStaff.findUnique({
    where: { id },
    select: { email: true, role: true, managerId: true, isActive: true },
  })
  if (current === null) {
    throw new NotFoundError()
  }

  const role = fromApiRole(input.role)
  assertNotChangingSelf(user, id, current.role, role, input.isActive)
  if (input.email !== current.email) {
    await assertEmailAvailable(input.email, id)
  }
  if (input.managerId !== null) {
    await assertValidManagerChange(id, input.managerId, current.managerId)
  }
  if (current.role === 'MANAGER' && role !== 'MANAGER' && (await countActiveSubordinates(id)) > 0) {
    throw new ConflictError(undefined, STAFF_MESSAGES.hasSubordinates)
  }

  const { password, ...rest } = input
  const passwordHash = password === undefined ? undefined : await hashPassword(password)
  const deactivated = current.isActive && !input.isActive

  const row = await withEmailConflict(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.salesStaff.update({
        where: { id },
        data: { ...rest, role, ...(passwordHash !== undefined && { passwordHash }) },
        select: staffSelect,
      })
      if (deactivated) {
        // 無効にした人は、ログイン中でもすぐに使えなくする（docs/api.md §1.2）
        await deleteSessionsForStaff(id, tx)
      }
      return updated
    }),
  )
  return toView(row)
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

/** 管理者が自分自身を無効にしたり、自分の権限を変えたりしようとしていたら 400 */
function assertNotChangingSelf(user: AuthzUser, id: number, currentRole: Role, role: Role, isActive: boolean): void {
  if (id !== user.id) {
    return
  }
  if (!isActive) {
    throw ValidationError.forField('is_active', STAFF_MESSAGES.selfDeactivate)
  }
  if (role !== currentRole) {
    throw ValidationError.forField('role', STAFF_MESSAGES.selfRoleChange)
  }
}

/**
 * メールアドレスが他の人に使われていないことを確かめる。使われていたら 409 `EMAIL_ALREADY_EXISTS`。
 * ログインは大文字・小文字を区別しないため、区別せずに比べる（決定事項 #31）
 */
async function assertEmailAvailable(email: string, exceptId?: number): Promise<void> {
  const existing = await prisma.salesStaff.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, ...(exceptId !== undefined && { id: { not: exceptId } }) },
    select: { id: true },
  })
  if (existing !== null) {
    throw new ConflictError('EMAIL_ALREADY_EXISTS')
  }
}

/** 同時に同じメールアドレスで登録された場合（一意制約の違反）も、409 `EMAIL_ALREADY_EXISTS` にする */
async function withEmailConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('EMAIL_ALREADY_EXISTS')
    }
    throw error
  }
}

/** 上長に指定できる（有効な manager である）ことを確かめる。違えば 400 */
async function assertAssignableManager(managerId: number): Promise<void> {
  const manager = await prisma.salesStaff.findUnique({ where: { id: managerId }, select: { role: true, isActive: true } })
  if (manager === null || !manager.isActive || manager.role !== 'MANAGER') {
    throw ValidationError.forField('manager_id', STAFF_MESSAGES.invalidManager)
  }
}

/**
 * 更新で上長を変えるときの確認。自分自身・自分の配下なら 400（循環防止。U-06）。
 * 今と同じ上長なら確かめない（上長を無効にした後でも、付け替えずに他の項目を直せるようにするため。決定事項 #30 と同じ考え方）
 */
async function assertValidManagerChange(id: number, managerId: number, currentManagerId: number | null): Promise<void> {
  if (managerId === currentManagerId) {
    return
  }
  if (managerId === id) {
    throw ValidationError.forField('manager_id', STAFF_MESSAGES.managerCycle)
  }
  await assertAssignableManager(managerId)
  const all = await prisma.salesStaff.findMany({ select: { id: true, managerId: true } })
  if (wouldCreateManagerCycle(id, managerId, new Map(all.map((staff) => [staff.id, staff.managerId])))) {
    throw ValidationError.forField('manager_id', STAFF_MESSAGES.managerCycle)
  }
}

/** 有効な直属の部下の人数（決定事項 #17） */
function countActiveSubordinates(managerId: number): Promise<number> {
  return prisma.salesStaff.count({ where: { managerId, isActive: true } })
}
