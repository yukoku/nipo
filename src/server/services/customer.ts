import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { CustomerCreateRequest, CustomerListQuery, CustomerUpdateRequest } from '@/schemas/customer'
import type { PageMeta } from '@/schemas/pagination'
import type { CamelCaseKeys } from '@/lib/case'
import { NotFoundError, ValidationError } from '@/server/api/errors'
import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import type { AuthzUser } from '@/server/authz/report'
import { hasRole, requireRole } from '@/server/authz/role'
import { prisma } from '@/server/db/prisma'

/** 顧客オブジェクト（docs/api.md §6。services の形。API の形への変換は response で行う） */
export interface CustomerView {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  address: string | null
  assignedSales: { id: number; name: string } | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type CustomerListInput = CamelCaseKeys<CustomerListQuery>
export type CustomerCreateInput = CamelCaseKeys<CustomerCreateRequest>
export type CustomerUpdateInput = CamelCaseKeys<CustomerUpdateRequest>

/** 担当営業に指定できない営業を指定したときのメッセージ */
export const INVALID_ASSIGNED_SALES_MESSAGE = '担当営業には有効な営業担当者を指定してください'

const customerSelect = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  address: true,
  assignedSales: { select: { id: true, name: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect

/**
 * M-01 顧客一覧。顧客名の昇順（同名なら ID の昇順）。
 * 無効な顧客を含められるのは管理者だけ。営業・上長は日報入力の顧客選択に使うため、常に有効な顧客だけを返す
 */
export async function listCustomers(
  user: AuthzUser,
  query: CustomerListInput,
): Promise<{ items: CustomerView[]; meta: PageMeta }> {
  const includeInactive = query.includeInactive && hasRole(user, 'ADMIN')
  const where: Prisma.CustomerWhereInput = {
    ...(query.name && { name: { contains: query.name, mode: 'insensitive' } }),
    ...(query.assignedSalesId !== undefined && { assignedSalesId: query.assignedSalesId }),
    ...(!includeInactive && { isActive: true }),
  }

  const [items, totalCount] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...toPrismaPagination(query),
    }),
    prisma.customer.count({ where }),
  ])
  return { items, meta: buildPageMeta(query, totalCount) }
}

/**
 * 日報入力（SC-03）の顧客セレクトの選択肢。有効な顧客だけ（T-UI-12・T-UI-22）。顧客名の昇順。営業・上長のみ。
 * 検索付きのセレクトで画面側で絞り込むため、ページングせずに全件を返す（顧客数は多くても数千件の想定）
 */
export async function listCustomerOptions(user: AuthzUser): Promise<{ id: number; name: string }[]> {
  requireRole(user, 'SALES', 'MANAGER')
  return prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}

/** M-02 顧客登録（管理者のみ）。`is_active = true` で登録する */
export async function createCustomer(user: AuthzUser, input: CustomerCreateInput): Promise<CustomerView> {
  requireRole(user, 'ADMIN')
  if (input.assignedSalesId !== null) {
    await assertAssignableSales(input.assignedSalesId)
  }

  return prisma.customer.create({
    data: { ...input, isActive: true },
    select: customerSelect,
  })
}

/** M-03 顧客詳細（管理者のみ）。なければ `NotFoundError`（404） */
export async function getCustomer(user: AuthzUser, id: number): Promise<CustomerView> {
  requireRole(user, 'ADMIN')
  const customer = await prisma.customer.findUnique({ where: { id }, select: customerSelect })
  if (customer === null) {
    throw new NotFoundError()
  }
  return customer
}

/**
 * M-04 顧客更新（管理者のみ）。省略した任意項目は未設定（null）になる（全項目の置き換え）。
 *
 * 担当営業は、今と同じ値なら確かめない。担当営業を無効にした後でも、担当を付け替えずに
 * 顧客の他の項目を直せるようにするため（決定事項 #30）
 */
export async function updateCustomer(user: AuthzUser, id: number, input: CustomerUpdateInput): Promise<CustomerView> {
  requireRole(user, 'ADMIN')
  const current = await prisma.customer.findUnique({ where: { id }, select: { assignedSalesId: true } })
  if (current === null) {
    throw new NotFoundError()
  }
  if (input.assignedSalesId !== null && input.assignedSalesId !== current.assignedSalesId) {
    await assertAssignableSales(input.assignedSalesId)
  }

  return prisma.customer.update({ where: { id }, data: input, select: customerSelect })
}

/**
 * 担当営業に指定できることを確かめる。有効な営業・上長でなければ `ValidationError`（400）。
 * 管理者は日報を書かない（顧客を担当しない）ため指定できない（決定事項 #30）
 */
async function assertAssignableSales(staffId: number): Promise<void> {
  const staff = await prisma.salesStaff.findUnique({ where: { id: staffId }, select: { role: true, isActive: true } })
  if (staff === null || !staff.isActive || staff.role === 'ADMIN') {
    throw ValidationError.forField('assigned_sales_id', INVALID_ASSIGNED_SALES_MESSAGE)
  }
}
