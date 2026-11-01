import 'server-only'

import { prisma } from '@/server/db/prisma'
import type { Health } from '@/schemas/health'

/**
 * アプリが動いているかを返す（H-01）。`check: 'db'` なら DB に接続できるかも確認する。
 * DB に接続できなければ例外になり、API は 500 を返す
 */
export async function checkHealth({ check }: { check?: 'db' }): Promise<Health> {
  if (check === 'db') {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', checks: { db: 'ok' } }
  }
  return { status: 'ok' }
}
