import { describe, expect, it } from 'vitest'

import { ForbiddenError } from '@/server/api/errors'
import { prisma } from '@/server/db/prisma'
import { SEED_STAFF } from '@/server/db/seed/data'

import { listDepartments, listManagerOptions, listStaffOptions } from './sales-staff'

const admin = { id: SEED_STAFF.admin.id, role: 'ADMIN' } as const

describe('listStaffOptions（選択肢に使う営業の一覧）', () => {
  it('指定したロールの有効な人だけを、氏名の昇順で返す（無効な退職者・管理者は含まない）', async () => {
    const options = await listStaffOptions(admin, ['SALES', 'MANAGER'])

    expect(options.map((staff) => staff.name)).toEqual(['伊藤三郎', '佐藤花子', '山田太郎', '田中次郎', '鈴木一郎'])
    expect(options[0]).toEqual({ id: SEED_STAFF.ito.id, name: '伊藤三郎' })
  })

  it('無効にした人は選択肢から外れる', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.yamada.id }, data: { isActive: false } })

    expect((await listStaffOptions(admin, ['SALES'])).map((staff) => staff.name)).not.toContain('山田太郎')
  })

  it('管理者以外は使えない', async () => {
    await expect(listStaffOptions({ id: SEED_STAFF.suzuki.id, role: 'MANAGER' }, ['SALES'])).rejects.toThrow(ForbiddenError)
  })
})

describe('listDepartments（登録済みの部署の一覧）', () => {
  it('部署を重複なしで昇順に返し、部署が未設定の人は含めない', async () => {
    expect(await listDepartments(admin)).toEqual(['営業1課', '営業2課'])
  })

  it('無効な担当者だけが使っている部署も含める', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.retired.id }, data: { department: '旧部署' } })

    expect(await listDepartments(admin)).toContain('旧部署')
  })

  it('管理者以外は使えない', async () => {
    await expect(listDepartments({ id: SEED_STAFF.suzuki.id, role: 'MANAGER' })).rejects.toThrow(ForbiddenError)
  })
})

describe('listManagerOptions（上長セレクトの選択肢）', () => {
  it('新規のときは、有効な上長を氏名の昇順で返す', async () => {
    expect((await listManagerOptions(admin)).map((staff) => staff.name)).toEqual(['田中次郎', '鈴木一郎'])
  })

  it('T-UI-23: 編集する人自身は選択肢に出ない', async () => {
    expect((await listManagerOptions(admin, SEED_STAFF.suzuki.id)).map((staff) => staff.name)).toEqual(['田中次郎'])
  })

  it('編集する人の配下（部下の部下も含む）の上長は選択肢に出ない', async () => {
    // 田中を鈴木の部下にすると、田中は鈴木の配下になる
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.tanaka.id }, data: { managerId: SEED_STAFF.suzuki.id } })

    expect(await listManagerOptions(admin, SEED_STAFF.suzuki.id)).toEqual([])
    expect((await listManagerOptions(admin, SEED_STAFF.tanaka.id)).map((staff) => staff.name)).toEqual(['鈴木一郎'])
  })

  it('無効な上長は選択肢に出ない', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.tanaka.id }, data: { isActive: false } })

    expect((await listManagerOptions(admin, SEED_STAFF.yamada.id)).map((staff) => staff.name)).toEqual(['鈴木一郎'])
  })

  it('管理者以外は使えない', async () => {
    await expect(listManagerOptions({ id: SEED_STAFF.suzuki.id, role: 'MANAGER' })).rejects.toThrow(ForbiddenError)
  })
})
