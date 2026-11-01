import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaClient } from '@/generated/prisma/client'
import { dbDateToDateString, dbTimeToTimeString } from '@/lib/date'
import { verifyPassword } from '@/server/auth/password'
import { buildPoolConfig } from '@/server/db/pool-config'

import { SEED_PASSWORD, SEED_REPORTS, SEED_STAFF } from './data'
import { seedDatabase } from './seed'

// テスト用DB（.env.test の nipo_test）に対して実行する。テスト用DB のデータはすべて置き換わる
const prisma = new PrismaClient({ adapter: new PrismaPg(buildPoolConfig(process.env)) })

afterAll(async () => {
  await prisma.$disconnect()
})

/** 比較用に、DB の内容をパスワードのハッシュ以外すべて取り出す（ハッシュはソルトが毎回変わる） */
async function snapshot() {
  const [staff, customers, reports, visits, comments] = await Promise.all([
    prisma.salesStaff.findMany({ orderBy: { id: 'asc' }, omit: { passwordHash: true } }),
    prisma.customer.findMany({ orderBy: { id: 'asc' } }),
    prisma.dailyReport.findMany({ orderBy: { id: 'asc' } }),
    prisma.visitRecord.findMany({ orderBy: { id: 'asc' } }),
    prisma.comment.findMany({ orderBy: { id: 'asc' } }),
  ])
  return { staff, customers, reports, visits, comments }
}

describe('seedDatabase', () => {
  beforeAll(async () => {
    await seedDatabase(prisma)
  })

  it('テスト仕様書のデータが投入される', async () => {
    const data = await snapshot()
    expect(data.staff).toHaveLength(7)
    expect(data.customers).toHaveLength(4)
    expect(data.reports.map((r) => r.id)).toEqual([100, 101, 102, 103, 104, 105])
    expect(data.visits).toHaveLength(7)
    expect(data.comments).toHaveLength(1)
  })

  it('報告日・訪問時刻・提出日時がずれずに保存される', async () => {
    const report = await prisma.dailyReport.findUniqueOrThrow({
      where: { id: SEED_REPORTS.commented.id },
      include: { visitRecords: { orderBy: { sortOrder: 'asc' } } },
    })
    expect(dbDateToDateString(report.reportDate)).toBe('2026-10-29')
    expect(report.submittedAt?.toISOString()).toBe('2026-10-29T09:00:00.000Z') // 18:00 JST
    expect(report.visitRecords.map((v) => [dbTimeToTimeString(v.visitedAt!), v.sortOrder])).toEqual([
      ['10:00', 1],
      ['14:30', 2],
    ])
  })

  it('パスワードは Argon2id でハッシュ化され、Passw0rd で照合できる', async () => {
    const { passwordHash } = await prisma.salesStaff.findUniqueOrThrow({ where: { id: SEED_STAFF.yamada.id } })
    expect(passwordHash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(passwordHash, SEED_PASSWORD)).toBe(true)
  })

  it('何度実行しても同じデータになる（途中で追加・変更したデータも元に戻る）', async () => {
    const before = await snapshot()
    await prisma.customer.update({ where: { id: 10 }, data: { name: '変更した顧客名' } })
    await prisma.customer.create({ data: { name: '追加した顧客' } })

    await seedDatabase(prisma)

    expect(await snapshot()).toEqual(before)
  })

  it('投入後に新しく作った行の ID は、固定 ID の続きになる', async () => {
    const report = await prisma.dailyReport.create({
      data: { salesStaffId: SEED_STAFF.yamada.id, reportDate: new Date('2026-10-31T00:00:00Z') },
    })
    const customer = await prisma.customer.create({ data: { name: '新しい顧客' } })
    const staff = await prisma.salesStaff.create({
      data: { name: '新しい営業', email: 'new@example.com', passwordHash: 'x' },
    })
    expect([report.id, customer.id, staff.id]).toEqual([106, 14, 8])

    // 後片付け（他のテストのために初期状態へ戻す）
    await seedDatabase(prisma)
  })
})
