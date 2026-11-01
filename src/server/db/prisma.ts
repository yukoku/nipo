import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'
import { buildPoolConfig } from '@/server/db/pool-config'

function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(buildPoolConfig(process.env)) })
}

// 開発中はホットリロードのたびにこのモジュールが読み込み直される。
// そのたびに Client（と接続プール）を作ると接続が増え続けるため、globalThis に保持して使い回す。
// 本番ではモジュールは 1 回しか読み込まれないので保持しない
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

let client: PrismaClient | undefined

/**
 * 共有の Prisma Client を返す。初めて呼ばれたときに作る。
 * `DATABASE_URL` が未設定なら、ここで例外になる（import しただけでは例外にならない）
 */
export function getPrismaClient(): PrismaClient {
  client ??= globalForPrisma.prisma ?? createPrismaClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  return client
}

/**
 * アプリ全体で共有する Prisma Client。サーバー側のコード（src/server/）からだけ使う。
 *
 * 実体は、最初にプロパティを使ったとき（`prisma.salesStaff.count()` など）に作る（#67）。
 * import した時点で作ると、`next build` がページデータの収集でモジュールを読み込むだけで
 * `DATABASE_URL` が必要になり、DB の接続先がないビルド環境（Docker・CI）でビルドが失敗するため
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    // `await prisma` や Promise の判定で `then` を調べられただけで Client を作らない
    if (property === 'then') {
      return undefined
    }
    const instance = getPrismaClient()
    const value: unknown = Reflect.get(instance, property, instance)
    // `$queryRaw`・`$transaction` などのメソッドは、本物の Client を this にして呼ぶ
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
