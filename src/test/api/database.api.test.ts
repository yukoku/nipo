import { describe, expect, it } from 'vitest'

import { prisma } from '@/server/db/prisma'
import { SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'

// 各テストの前に setup-api.ts がテスト用DB をテストデータの状態に戻すことを確かめる。
// どのテストも、他のテストがデータを変えていても同じ初期データから始まる（実行順を入れ替えても成り立つ）
describe('APIテストの DB の初期化', () => {
  it('日報を全件消しても、このテストの中だけで済む', async () => {
    await prisma.comment.deleteMany()
    await prisma.visitRecord.deleteMany()
    await prisma.dailyReport.deleteMany()

    expect(await prisma.dailyReport.count()).toBe(0)
  })

  it('営業の名前を変えても、このテストの中だけで済む', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.yamada.id }, data: { name: '変更後の名前' } })

    expect((await prisma.salesStaff.findUniqueOrThrow({ where: { id: SEED_STAFF.yamada.id } })).name).toBe(
      '変更後の名前',
    )
  })

  it('日報を追加しても、このテストの中だけで済む', async () => {
    await prisma.dailyReport.create({
      data: { salesStaffId: SEED_STAFF.sato.id, reportDate: new Date('2026-10-31T00:00:00Z') },
    })

    expect(await prisma.dailyReport.count()).toBe(7)
  })

  it('テストの始まりは、いつもテストデータの状態', async () => {
    const reports = await prisma.dailyReport.findMany({ orderBy: { id: 'asc' }, select: { id: true } })
    const yamada = await prisma.salesStaff.findUniqueOrThrow({ where: { id: SEED_STAFF.yamada.id } })

    expect(reports.map((r) => r.id)).toEqual(Object.values(SEED_REPORTS).map((r) => r.id))
    expect(yamada.name).toBe(SEED_STAFF.yamada.name)
  })

  it('新しく作る行の ID は、いつも固定 ID の続きから始まる', async () => {
    const report = await prisma.dailyReport.create({
      data: { salesStaffId: SEED_STAFF.yamada.id, reportDate: new Date('2026-10-31T00:00:00Z') },
    })

    expect(report.id).toBe(106)
  })
})
