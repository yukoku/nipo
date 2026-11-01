/**
 * `api` プロジェクトの setupFiles。各 APIテストファイルの前に読み込まれる。
 *
 * - 各テストの前に、テスト用DB をテストデータ（docs/test-spec.md §2.2）の状態に戻す。
 *   そのため、どのテストも同じ初期データから始まり、実行する順番を変えても結果は変わらない
 * - ファイルの最後に DB の接続を閉じる
 *
 * 各テストファイルで呼び出す必要はない（呼び忘れによってテスト同士がデータで影響し合うのを防ぐため、自動で行う）
 */
import { afterAll, beforeEach } from 'vitest'

import { prisma } from '@/server/db/prisma'
import { seedDatabase } from '@/server/db/seed/seed'

import { assertTestDatabaseUrl } from './test-database-url'

assertTestDatabaseUrl(process.env.DATABASE_URL)

beforeEach(async () => {
  await seedDatabase(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})
