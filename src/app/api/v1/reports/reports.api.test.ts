import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { dateStringToDbDate } from '@/lib/date'
import { DATE_RANGE_ORDER_MESSAGE, reportListItemSchema } from '@/schemas/report'
import { listResponseSchema } from '@/schemas/response'
import { prisma } from '@/server/db/prisma'
import { SEED_CUSTOMERS, SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'

import { GET as list } from './route'

type ListItem = {
  id: number
  report_date: string
  sales_staff: { id: number; name: string }
  status: 'draft' | 'submitted'
  visit_count: number
  customers: { id: number; name: string }[]
  comment_count: number
  needs_comment: boolean
}
type ListBody = {
  data: ListItem[]
  meta: { page: number; per_page: number; total_count: number; total_pages: number }
  error?: { code: string; details?: { field: string; message: string }[] }
}

async function listAs(staff: SeedStaffKey, query: Record<string, string | number | undefined> = {}) {
  const { headers } = await loginAs(staff)
  return callRoute<ListBody>(list, '/api/v1/reports', { query, headers })
}

const idsOf = (body: ListBody) => body.data.map((report) => report.id)
const byId = (body: ListBody, id: number) => body.data.find((report) => report.id === id)

/** 山田の日報を `count` 件足す（2026-01-01 から 1 日ずつ。訪問記録なし・下書き） */
async function addYamadaReports(count: number): Promise<void> {
  await prisma.dailyReport.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      salesStaffId: SEED_STAFF.yamada.id,
      reportDate: dateStringToDbDate(`2026-01-${String(index + 1).padStart(2, '0')}`),
      status: 'DRAFT' as const,
    })),
  })
}

describe('GET /api/v1/reports（R-01）', () => {
  it('T-RPT-21: 営業は自分の日報だけ（下書きを含む）を取得できる', async () => {
    const response = await listAs('yamada')

    expect(response.status).toBe(200)
    expect(listResponseSchema(reportListItemSchema).safeParse(response.body).success).toBe(true)
    expect(idsOf(response.body).sort()).toEqual(
      [SEED_REPORTS.commented.id, SEED_REPORTS.submitted.id, SEED_REPORTS.draft.id].sort(),
    )
    expect(byId(response.body, SEED_REPORTS.draft.id)).toMatchObject({ status: 'draft', report_date: '2026-10-28' })
  })

  it('T-RPT-22: 上長は自分の日報と直属の部下の提出済み日報だけ（部下の下書き・他チームは含まない）', async () => {
    const response = await listAs('suzuki')

    expect(idsOf(response.body).sort()).toEqual(
      [SEED_REPORTS.commented.id, SEED_REPORTS.submitted.id, SEED_REPORTS.satoSubmitted.id].sort(),
    )
  })

  it('上長自身の日報（下書きを含む）も一覧に出る', async () => {
    const own = await prisma.dailyReport.create({
      data: { salesStaffId: SEED_STAFF.suzuki.id, reportDate: dateStringToDbDate('2026-10-31'), status: 'DRAFT' },
    })

    const response = await listAs('suzuki')

    expect(byId(response.body, own.id)).toMatchObject({ status: 'draft', needs_comment: false })
  })

  it('管理者は 403（日報を閲覧できない。決定事項 #7）', async () => {
    expect((await listAs('admin')).status).toBe(403)
  })

  it('T-AUTH-06: ログインしていなければ 401', async () => {
    expect((await callRoute(list, '/api/v1/reports')).status).toBe(401)
  })

  it('T-RPT-23: 上長が他チームの担当者を指定すると 403', async () => {
    expect((await listAs('suzuki', { sales_staff_id: SEED_STAFF.ito.id })).status).toBe(403)
  })

  it('T-RPT-24: 営業が他人を指定すると 403。存在しない担当者も 403（存在を推測させない）', async () => {
    expect((await listAs('yamada', { sales_staff_id: SEED_STAFF.sato.id })).status).toBe(403)
    expect((await listAs('yamada', { sales_staff_id: 9999 })).status).toBe(403)
  })

  it('担当者は、自分か直属の部下なら指定できる', async () => {
    const own = await listAs('yamada', { sales_staff_id: SEED_STAFF.yamada.id })
    const subordinate = await listAs('suzuki', { sales_staff_id: SEED_STAFF.sato.id })

    expect(idsOf(own.body)).toHaveLength(3)
    expect(idsOf(subordinate.body)).toEqual([SEED_REPORTS.satoSubmitted.id])
  })

  it('無効になった部下の過去の日報も、上長は担当者を指定して取得できる（決定事項 #16）', async () => {
    const report = await prisma.dailyReport.create({
      data: {
        salesStaffId: SEED_STAFF.retired.id,
        reportDate: dateStringToDbDate('2026-09-30'),
        status: 'SUBMITTED',
        submittedAt: new Date('2026-09-30T18:00:00+09:00'),
      },
    })

    const response = await listAs('suzuki', { sales_staff_id: SEED_STAFF.retired.id })

    expect(response.status).toBe(200)
    expect(idsOf(response.body)).toEqual([report.id])
  })

  it('T-RPT-25: 期間（date_from〜date_to）で絞り込める。両端の日を含む', async () => {
    const response = await listAs('yamada', { date_from: '2026-10-29', date_to: '2026-10-30' })

    expect(idsOf(response.body)).toEqual([SEED_REPORTS.submitted.id, SEED_REPORTS.commented.id])
  })

  it('期間は片方だけでも指定できる', async () => {
    expect(idsOf((await listAs('yamada', { date_from: '2026-10-30' })).body)).toEqual([SEED_REPORTS.submitted.id])
    expect(idsOf((await listAs('yamada', { date_to: '2026-10-28' })).body)).toEqual([SEED_REPORTS.draft.id])
  })

  it('終了日が開始日より前・日付の形式が正しくなければ 400', async () => {
    const reversed = await listAs('yamada', { date_from: '2026-10-30', date_to: '2026-10-29' })
    const invalid = await listAs('yamada', { date_from: '2026/10/01' })

    expect(reversed.status).toBe(400)
    expect(reversed.body.error?.details).toEqual([{ field: 'date_to', message: DATE_RANGE_ORDER_MESSAGE }])
    expect(invalid.status).toBe(400)
    expect(invalid.body.error?.details?.[0]?.field).toBe('date_from')
  })

  it('T-RPT-26: 顧客名の部分一致で、その顧客の訪問記録を含む日報だけを返す（大文字・小文字を区別しない）', async () => {
    const response = await listAs('yamada', { customer_name: 'abc' })

    // ABC商事（10）の訪問記録を含むのは 100（501）と 102（504）
    expect(idsOf(response.body)).toEqual([SEED_REPORTS.commented.id, SEED_REPORTS.draft.id])
  })

  it('T-NF-06: 検索条件に SQL を入れても、エラーにならず他人のデータも出ない', async () => {
    const response = await listAs('yamada', { customer_name: "' OR 1=1 --" })

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([])
  })

  it('T-RPT-27: 並び順は報告日の降順、同じ日は担当者名の昇順', async () => {
    const response = await listAs('suzuki')

    // 10/30 は佐藤花子（103）→ 山田太郎（101）、10/29 は山田（100）
    expect(response.body.data.map((report) => [report.report_date, report.sales_staff.name])).toEqual([
      ['2026-10-30', '佐藤花子'],
      ['2026-10-30', '山田太郎'],
      ['2026-10-29', '山田太郎'],
    ])
  })

  it('T-RPT-28: visit_count・comment_count が実データと一致する', async () => {
    const response = await listAs('yamada')

    expect(byId(response.body, SEED_REPORTS.commented.id)).toMatchObject({ visit_count: 2, comment_count: 1 })
    expect(byId(response.body, SEED_REPORTS.submitted.id)).toMatchObject({ visit_count: 1, comment_count: 0 })
    expect(byId(response.body, SEED_REPORTS.draft.id)).toMatchObject({ visit_count: 1, comment_count: 0 })
  })

  it('customers に訪問した顧客を、重複なし・訪問記録の順で返す（無効になった顧客も含む。訪問 0 件なら空）', async () => {
    // 100 の訪問記録（ABC商事 → XYZ工業）の後ろに、ABC商事（重複）と旧取引先（無効）を足す
    await prisma.visitRecord.createMany({
      data: [
        { dailyReportId: SEED_REPORTS.commented.id, customerId: SEED_CUSTOMERS.abc.id, content: '再訪問', sortOrder: 3 },
        { dailyReportId: SEED_REPORTS.commented.id, customerId: SEED_CUSTOMERS.old.id, content: '挨拶', sortOrder: 4 },
      ],
    })
    await prisma.visitRecord.deleteMany({ where: { dailyReportId: SEED_REPORTS.draft.id } })

    const response = await listAs('yamada')

    expect(byId(response.body, SEED_REPORTS.commented.id)?.customers).toEqual([
      { id: SEED_CUSTOMERS.abc.id, name: 'ABC商事' },
      { id: SEED_CUSTOMERS.xyz.id, name: 'XYZ工業' },
      { id: SEED_CUSTOMERS.old.id, name: '旧取引先' },
    ])
    expect(byId(response.body, SEED_REPORTS.commented.id)?.visit_count).toBe(4)
    expect(byId(response.body, SEED_REPORTS.draft.id)?.customers).toEqual([])
  })

  it('T-RPT-29: 上長から見て、部下の提出済み日報でコメントが 0 件なら needs_comment=true', async () => {
    const response = await listAs('suzuki')

    expect(byId(response.body, SEED_REPORTS.submitted.id)?.needs_comment).toBe(true)
    expect(byId(response.body, SEED_REPORTS.satoSubmitted.id)?.needs_comment).toBe(true)
    expect(byId(response.body, SEED_REPORTS.commented.id)?.needs_comment).toBe(false)
  })

  it('営業から見ると、needs_comment は常に false', async () => {
    const response = await listAs('yamada')

    expect(response.body.data.every((report) => !report.needs_comment)).toBe(true)
  })

  it('T-RPT-30: 日報 25 件で page=2・per_page=20 なら 5 件、total_count=25・total_pages=2', async () => {
    await addYamadaReports(22) // 既存の 3 件と合わせて 25 件

    const response = await listAs('yamada', { page: 2, per_page: 20 })

    expect(response.body.data).toHaveLength(5)
    expect(response.body.meta).toEqual({ page: 2, per_page: 20, total_count: 25, total_pages: 2 })
  })

  it('0 件なら空の配列と total_pages=0', async () => {
    const response = await listAs('yamada', { date_from: '2030-01-01' })

    expect(response.body).toMatchObject({ data: [], meta: { total_count: 0, total_pages: 0 } })
  })

  it('日報の件数が増えても、実行する SQL の本数は変わらない（N+1 になっていない）', async () => {
    const query = vi.spyOn(pg.Client.prototype, 'query')
    const countQueries = async () => {
      const { headers } = await loginAs('yamada')
      query.mockClear()
      const response = await callRoute<ListBody>(list, '/api/v1/reports', { query: { per_page: 100 }, headers })
      return { rows: response.body.data.length, queries: query.mock.calls.length }
    }

    const few = await countQueries()
    await addYamadaReports(20)
    const many = await countQueries()
    query.mockRestore()

    expect(many.rows).toBe(few.rows + 20)
    expect(few.queries).toBeGreaterThan(0)
    expect(many.queries).toBe(few.queries)
  })
})
