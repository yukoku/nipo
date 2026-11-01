import { afterAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/db/prisma'

// テスト用DB（.env.test の nipo_test。マイグレーション適用済み）に実際に接続して、
// 遅延生成の Proxy 越しでも Prisma Client の機能がそのまま使えることを確かめる（#67）。読み取りだけ行う
describe('prisma（テスト用DB）', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('モデルのクエリを実行できる', async () => {
    await expect(prisma.salesStaff.count()).resolves.toEqual(expect.any(Number))
  })

  it('$queryRaw（タグ付きテンプレート）を実行できる', async () => {
    await expect(prisma.$queryRaw<{ value: number }[]>`SELECT 1 AS value`).resolves.toEqual([{ value: 1 }])
  })

  it('$transaction の中でも同じように使える', async () => {
    const [count] = await prisma.$transaction(async (tx) => [await tx.customer.count()])
    expect(count).toEqual(expect.any(Number))
  })
})
