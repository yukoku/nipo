import { describe, expect, it } from 'vitest'

import { dataResponseSchema } from '@/schemas/response'
import { reportSchema } from '@/schemas/report'
import { prisma } from '@/server/db/prisma'
import { SEED_CUSTOMERS, SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'

import { GET } from './route'

type Report = {
  id: number
  report_date: string
  sales_staff: { id: number; name: string }
  status: 'draft' | 'submitted'
  submitted_at: string | null
  problem: string | null
  plan: string | null
  visit_records: { id: number; customer: { id: number; name: string }; visited_at: string | null; content: string; sort_order: number }[]
  comments: { id: number; target: string; body: string; commenter: { id: number; name: string }; created_at: string; updated_at: string }[]
  permissions: { can_edit: boolean; can_delete: boolean; can_comment: boolean }
  created_at: string
  updated_at: string
}
type Body = { data: Report; error?: { code: string; message: string } }

async function getAs(staff: SeedStaffKey, id: number | string) {
  const { headers } = await loginAs(staff)
  return callRoute<Body>(GET, `/api/v1/reports/${id}`, { params: { id: String(id) }, headers })
}

describe('GET /api/v1/reports/{id}（R-03）', () => {
  it('T-RPT-41: 本人は自分の下書きを閲覧できる', async () => {
    const response = await getAs('yamada', SEED_REPORTS.draft.id)

    expect(response.status).toBe(200)
    expect(dataResponseSchema(reportSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: SEED_REPORTS.draft.id,
      report_date: '2026-10-28',
      sales_staff: { id: SEED_STAFF.yamada.id, name: '山田太郎' },
      status: 'draft',
      submitted_at: null,
      problem: '提案資料の作り直しが必要。',
      plan: null,
      visit_records: [{ id: 504, customer: { id: SEED_CUSTOMERS.abc.id, name: 'ABC商事' }, visited_at: null, content: '定例の打ち合わせ。', sort_order: 1 }],
      comments: [],
      created_at: '2026-10-28T17:00:00+09:00',
    })
  })

  it('T-RPT-42: 上長は部下の提出済み日報を閲覧でき、コメントはできるが編集はできない', async () => {
    const response = await getAs('suzuki', SEED_REPORTS.satoSubmitted.id)

    expect(response.status).toBe(200)
    expect(response.body.data.permissions).toEqual({ can_edit: false, can_delete: false, can_comment: true })
    expect(response.body.data.submitted_at).toBe('2026-10-30T19:00:00+09:00')
  })

  it('T-RPT-43: 上長は部下の下書きを閲覧できない（404）', async () => {
    expect((await getAs('suzuki', SEED_REPORTS.satoDraft.id)).status).toBe(404)
  })

  it('T-RPT-44: 他チームの上長は閲覧できない（404）', async () => {
    expect((await getAs('tanaka', SEED_REPORTS.submitted.id)).status).toBe(404)
  })

  it('T-RPT-45: 同僚は閲覧できない（404）', async () => {
    expect((await getAs('sato', SEED_REPORTS.submitted.id)).status).toBe(404)
  })

  it('T-RPT-46: 存在しない ID は、閲覧できない日報と同じ 404 レスポンス', async () => {
    const missing = await getAs('yamada', 9999)
    const forbidden = await getAs('tanaka', SEED_REPORTS.submitted.id)

    expect(missing.status).toBe(404)
    expect(missing.body).toEqual(forbidden.body)
  })

  it('数字でない ID・範囲外の ID も 404（決定事項 #30）', async () => {
    expect((await getAs('yamada', 'abc')).status).toBe(404)
    expect((await getAs('yamada', '99999999999')).status).toBe(404)
  })

  it('管理者は閲覧できない（404。決定事項 #7）', async () => {
    expect((await getAs('admin', SEED_REPORTS.submitted.id)).status).toBe(404)
  })

  it('ログインしていなければ 401', async () => {
    const response = await callRoute(GET, `/api/v1/reports/${SEED_REPORTS.submitted.id}`, {
      params: { id: String(SEED_REPORTS.submitted.id) },
    })

    expect(response.status).toBe(401)
  })

  it('T-RPT-47: 本人から見た編集・削除の可否（100 / 101 / 102）', async () => {
    const commented = await getAs('yamada', SEED_REPORTS.commented.id)
    const submitted = await getAs('yamada', SEED_REPORTS.submitted.id)
    const draft = await getAs('yamada', SEED_REPORTS.draft.id)

    expect(commented.body.data.permissions).toEqual({ can_edit: false, can_delete: false, can_comment: false })
    expect(submitted.body.data.permissions).toEqual({ can_edit: true, can_delete: false, can_comment: false })
    expect(draft.body.data.permissions).toEqual({ can_edit: true, can_delete: true, can_comment: false })
  })

  it('T-RPT-48: 訪問記録は sort_order の順、コメントは created_at の昇順', async () => {
    const reportId = SEED_REPORTS.commented.id
    // 訪問記録の並びを入れ替え（502 を 1 番目に）、コメントを先の日時・後の日時で足す
    await prisma.visitRecord.update({ where: { id: 501 }, data: { sortOrder: 3 } })
    await prisma.comment.createMany({
      data: [
        { dailyReportId: reportId, commenterId: SEED_STAFF.suzuki.id, target: 'PLAN', body: '後のコメント', createdAt: new Date('2026-10-30T09:00:00+09:00') },
        { dailyReportId: reportId, commenterId: SEED_STAFF.suzuki.id, target: 'PLAN', body: '先のコメント', createdAt: new Date('2026-10-29T18:30:00+09:00') },
      ],
    })

    const response = await getAs('yamada', reportId)

    expect(response.body.data.visit_records.map((r) => [r.id, r.sort_order])).toEqual([
      [502, 2],
      [501, 3],
    ])
    expect(response.body.data.comments.map((c) => [c.target, c.body, c.created_at])).toEqual([
      ['plan', '先のコメント', '2026-10-29T18:30:00+09:00'],
      ['problem', '5%までなら即決OK。それ以上は相談して。', '2026-10-29T19:10:00+09:00'],
      ['plan', '後のコメント', '2026-10-30T09:00:00+09:00'],
    ])
    expect(response.body.data.comments[1]?.commenter).toEqual({ id: SEED_STAFF.suzuki.id, name: '鈴木一郎' })
  })

  it('T-CUS-09: 顧客を無効にしても、過去の日報の訪問記録には顧客名がそのまま出る', async () => {
    await prisma.customer.update({ where: { id: SEED_CUSTOMERS.abc.id }, data: { isActive: false } })

    const response = await getAs('yamada', SEED_REPORTS.commented.id)

    expect(response.status).toBe(200)
    expect(response.body.data.visit_records[0]?.customer).toEqual({ id: SEED_CUSTOMERS.abc.id, name: 'ABC商事' })
  })

  it('無効になった部下の過去の提出済み日報も、上長は閲覧できる（決定事項 #16）', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.yamada.id }, data: { isActive: false } })

    const response = await getAs('suzuki', SEED_REPORTS.submitted.id)

    expect(response.status).toBe(200)
    expect(response.body.data.permissions.can_comment).toBe(true)
  })
})
