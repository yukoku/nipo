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

/** アプリ全体で共有する Prisma Client。サーバー側のコード（src/server/）からだけ使う */
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
