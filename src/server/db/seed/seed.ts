import 'server-only'

import type { PrismaClient } from '@/generated/prisma/client'
import { dateStringToDbDate, timeStringToDbTime } from '@/lib/date'
import { hashPassword } from '@/server/auth/password'

import { SEED_CUSTOMERS, SEED_PASSWORD, SEED_REPORTS, SEED_STAFF } from './data'

/** マスタの作成日時（すべて同じ値にして、何度投入しても同じデータになるようにする） */
const MASTER_CREATED_AT = new Date('2026-04-01T10:00:00+09:00')

/** テストデータのパスワードのハッシュ（計算結果を使い回す） */
let passwordHashCache: Promise<string> | undefined

/** ID を固定で投入するテーブル。投入後に ID の採番（シーケンス）を最大値まで進める */
const TABLES_WITH_FIXED_IDS = ['sales_staff', 'customers', 'daily_reports', 'visit_records', 'comments'] as const

/**
 * テストデータ（docs/test-spec.md §2.2）を投入する。
 *
 * **既存のデータはすべて削除する**（`_prisma_migrations` 以外の全テーブルを空にしてから投入する）。
 * そのため、何度実行しても同じデータになる。投入後に新しく作った行の ID は、固定 ID の続き（日報なら 106〜）になる。
 *
 * コマンドからは `npx prisma db seed`（prisma/seed.ts）で実行する。APIテストの初期化（#15）からも呼ぶ。
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // ハッシュの計算は重い（約 19 MiB・数十ミリ秒）ため、全員共通のパスワードで 1 回だけ計算し、
  // 2 回目以降の呼び出し（APIテストでは各テストの前に呼ぶ）でも使い回す
  passwordHashCache ??= hashPassword(SEED_PASSWORD).catch((error: unknown) => {
    // 失敗した結果を使い回さないよう、次の呼び出しで計算し直す
    passwordHashCache = undefined
    throw error
  })
  const passwordHash = await passwordHashCache

  await prisma.$transaction(async (tx) => {
    await truncateAllTables(tx)

    await tx.salesStaff.createMany({
      data: Object.values(SEED_STAFF).map((staff) => ({
        ...staff,
        passwordHash,
        createdAt: MASTER_CREATED_AT,
        updatedAt: MASTER_CREATED_AT,
      })),
    })

    await tx.customer.createMany({
      data: Object.values(SEED_CUSTOMERS).map((customer) => ({
        ...customer,
        createdAt: MASTER_CREATED_AT,
        updatedAt: MASTER_CREATED_AT,
      })),
    })

    const reports = Object.values(SEED_REPORTS)

    await tx.dailyReport.createMany({
      data: reports.map((report) => {
        const createdAt = new Date(report.createdAt)
        return {
          id: report.id,
          salesStaffId: report.salesStaffId,
          reportDate: dateStringToDbDate(report.reportDate),
          status: report.status,
          problem: report.problem,
          plan: report.plan,
          submittedAt: report.submittedAt === null ? null : new Date(report.submittedAt),
          createdAt,
          updatedAt: createdAt,
        }
      }),
    })

    await tx.visitRecord.createMany({
      data: reports.flatMap((report) => {
        const createdAt = new Date(report.createdAt)
        return report.visits.map((visit, index) => ({
          id: visit.id,
          dailyReportId: report.id,
          customerId: visit.customerId,
          visitedAt: visit.visitedAt === null ? null : timeStringToDbTime(visit.visitedAt),
          content: visit.content,
          sortOrder: index + 1,
          createdAt,
          updatedAt: createdAt,
        }))
      }),
    })

    await tx.comment.createMany({
      data: reports.flatMap((report) =>
        report.comments.map((comment) => {
          const createdAt = new Date(comment.createdAt)
          return {
            id: comment.id,
            dailyReportId: report.id,
            commenterId: comment.commenterId,
            target: comment.target,
            body: comment.body,
            createdAt,
            updatedAt: createdAt,
          }
        }),
      ),
    })

    await syncIdSequences(tx)
  })
}

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * `_prisma_migrations` 以外の全テーブルを空にし、ID の採番を 1 に戻す。
 * テーブル名を決め打ちにしないのは、今後テーブル（sessions・login_attempts など）が増えても消し漏れないようにするため
 */
async function truncateAllTables(tx: TransactionClient): Promise<void> {
  const tables = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return

  // テーブル名は pg_tables から取得した値だけを使い、quote_ident 相当の二重引用符で囲む
  const list = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ')
  await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** ID を固定で投入したテーブルの採番を最大値まで進める（次に作る行が固定 ID の続きになるようにする） */
async function syncIdSequences(tx: TransactionClient): Promise<void> {
  for (const table of TABLES_WITH_FIXED_IDS) {
    // table は上の定数だけなので、SQL に埋め込んでも安全
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT MAX(id) FROM "${table}"))`,
    )
  }
}
