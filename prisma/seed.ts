/**
 * テストデータの投入（`npx prisma db seed` / `npm run db:seed`）
 *
 * - 既存のデータはすべて削除してから投入する（何度実行しても同じデータになる）
 * - 本番環境では実行できない
 *
 * `src/server/` のコードは先頭で `import 'server-only'` しているため、
 * prisma.config.ts の seed コマンドで `--conditions=react-server` を付けて実行する
 */
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'
import { buildPoolConfig } from '@/server/db/pool-config'
import { seedDatabase } from '@/server/db/seed/seed'

/** 本番環境で実行されないようにする。Cloud Run では K_SERVICE が必ず設定される */
function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production' || env.K_SERVICE !== undefined) {
    throw new Error('本番環境ではテストデータを投入できません（既存のデータがすべて削除されるため）')
  }
}

async function main(): Promise<void> {
  assertNotProduction(process.env)

  const prisma = new PrismaClient({ adapter: new PrismaPg(buildPoolConfig(process.env)) })
  try {
    await seedDatabase(prisma)
    const [staff, customers, reports] = await Promise.all([
      prisma.salesStaff.count(),
      prisma.customer.count(),
      prisma.dailyReport.count(),
    ])
    process.stdout.write(`テストデータを投入しました（営業 ${staff} 件・顧客 ${customers} 件・日報 ${reports} 件）\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
