import { describe, expect, it } from 'vitest'

import { dataResponseSchema } from '@/schemas/response'
import { reportSchema } from '@/schemas/report'
import { prisma } from '@/server/db/prisma'
import { SEED_CUSTOMERS, SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'
import {
  CANNOT_REVERT_TO_DRAFT_MESSAGE,
  INVALID_CUSTOMER_MESSAGE,
  UNKNOWN_VISIT_RECORD_MESSAGE,
} from '@/server/services/report'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'
import { TEST_BASE_DATE, setupFixedTime } from '@/test/time'

import { PUT } from './route'

type Report = {
  id: number
  report_date: string
  status: 'draft' | 'submitted'
  submitted_at: string | null
  problem: string | null
  plan: string | null
  visit_records: { id: number; customer: { id: number; name: string }; visited_at: string | null; content: string; sort_order: number }[]
  permissions: { can_edit: boolean; can_delete: boolean; can_comment: boolean }
}
type Body = {
  data: Report
  error?: { code: string; reason?: string; details?: { field: string; message: string }[] }
}

const SUBMIT = { status: 'submitted', problem: '相談したい。', plan: '資料送付' }

async function updateAs(staff: SeedStaffKey, id: number, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<Body>(PUT, `/api/v1/reports/${id}`, { method: 'PUT', params: { id: String(id) }, body, headers })
}

/** 日報の内容（比較用）を DB から読む */
const snapshot = (id: number) =>
  prisma.dailyReport.findUnique({
    where: { id },
    select: {
      status: true,
      problem: true,
      plan: true,
      submittedAt: true,
      reportDate: true,
      updatedAt: true,
      visitRecords: { select: { id: true, customerId: true, content: true, sortOrder: true }, orderBy: { id: 'asc' } },
    },
  })

describe('PUT /api/v1/reports/{id}（R-04）', () => {
  setupFixedTime() // 2026-10-31 10:00 JST

  it('T-RPT-61: 下書きを提出すると 200、submitted_at に現在日時が入る', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.draft.id, {
      ...SUBMIT,
      visit_records: [{ id: 504, customer_id: SEED_CUSTOMERS.abc.id, visited_at: '09:30', content: '定例の打ち合わせ（修正）' }],
    })

    expect(response.status).toBe(200)
    expect(dataResponseSchema(reportSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: SEED_REPORTS.draft.id,
      status: 'submitted',
      submitted_at: '2026-10-31T10:00:00+09:00',
      problem: '相談したい。',
      plan: '資料送付',
      visit_records: [{ id: 504, visited_at: '09:30', content: '定例の打ち合わせ（修正）', sort_order: 1 }],
      permissions: { can_edit: true, can_delete: false, can_comment: false },
    })
  })

  it('T-RPT-62: 既存 A・B・C に「A（変更）, 新規 D」を送ると、A は更新・D は追加・B と C は削除、sort_order は A=1, D=2', async () => {
    const reportId = SEED_REPORTS.submitted.id // 既存行 A = 503
    const added = await prisma.visitRecord.createManyAndReturn({
      data: [
        { dailyReportId: reportId, customerId: SEED_CUSTOMERS.abc.id, content: 'B', sortOrder: 2 },
        { dailyReportId: reportId, customerId: SEED_CUSTOMERS.def.id, content: 'C', sortOrder: 3 },
      ],
      select: { id: true },
    })

    const response = await updateAs('yamada', reportId, {
      ...SUBMIT,
      visit_records: [
        { id: 503, customer_id: SEED_CUSTOMERS.xyz.id, visited_at: '11:00', content: 'A（変更）' },
        { customer_id: SEED_CUSTOMERS.def.id, visited_at: null, content: 'D' },
      ],
    })

    expect(response.status).toBe(200)
    const records = response.body.data.visit_records
    expect(records.map((r) => [r.content, r.sort_order])).toEqual([
      ['A（変更）', 1],
      ['D', 2],
    ])
    expect(records[0]?.id).toBe(503)
    expect(records[1]?.id).not.toBe(503)
    expect(await prisma.visitRecord.count({ where: { id: { in: added.map((r) => r.id) } } })).toBe(0)
  })

  it('T-RPT-63: コメントが付いた日報は 409 REPORT_LOCKED、データは変わらない', async () => {
    const before = await snapshot(SEED_REPORTS.commented.id)

    const response = await updateAs('yamada', SEED_REPORTS.commented.id, { ...SUBMIT, visit_records: [] })

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({ code: 'CONFLICT', reason: 'REPORT_LOCKED' })
    expect(await snapshot(SEED_REPORTS.commented.id)).toEqual(before)
  })

  it('T-RPT-64: 本人以外（閲覧できる上長）は 403', async () => {
    const before = await snapshot(SEED_REPORTS.submitted.id)

    const response = await updateAs('suzuki', SEED_REPORTS.submitted.id, { ...SUBMIT, visit_records: [] })

    expect(response.status).toBe(403)
    expect(await snapshot(SEED_REPORTS.submitted.id)).toEqual(before)
  })

  it('閲覧できない日報・存在しない日報は 404（同僚・他チームの上長・管理者・部下の下書き）', async () => {
    const body = { ...SUBMIT, visit_records: [] }

    expect((await updateAs('sato', SEED_REPORTS.submitted.id, body)).status).toBe(404)
    expect((await updateAs('tanaka', SEED_REPORTS.submitted.id, body)).status).toBe(404)
    expect((await updateAs('admin', SEED_REPORTS.submitted.id, body)).status).toBe(404)
    expect((await updateAs('suzuki', SEED_REPORTS.satoDraft.id, body)).status).toBe(404)
    expect((await updateAs('yamada', 9999, body)).status).toBe(404)
  })

  it('T-RPT-65: 提出済みを下書きに戻すと 400', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, { ...SUBMIT, status: 'draft', visit_records: [] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'status', message: CANNOT_REVERT_TO_DRAFT_MESSAGE }])
  })

  it('下書きのまま保存し直せる（submitted_at は null のまま）', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.draft.id, { status: 'draft', problem: '', plan: '', visit_records: [] })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ status: 'draft', submitted_at: null, problem: null, visit_records: [] })
  })

  it('T-RPT-66: report_date を送っても無視し、報告日は 2026-10-30 のまま', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, {
      ...SUBMIT,
      report_date: '2026-10-25',
      visit_records: [],
    })

    expect(response.status).toBe(200)
    expect(response.body.data.report_date).toBe('2026-10-30')
  })

  it('T-RPT-67: 提出済みの日報を再び提出しても、submitted_at は変わらない', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, { ...SUBMIT, visit_records: [] })

    expect(response.status).toBe(200)
    expect(response.body.data.submitted_at).toBe('2026-10-30T18:30:00+09:00')
    expect(TEST_BASE_DATE.getTime()).not.toBe(new Date('2026-10-30T18:30:00+09:00').getTime())
  })

  it('T-RPT-68: 他の日報の訪問記録の id を含めると 400、その訪問記録も自分の日報も変わらない', async () => {
    const otherBefore = await snapshot(SEED_REPORTS.satoSubmitted.id)
    const ownBefore = await snapshot(SEED_REPORTS.submitted.id)

    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, {
      ...SUBMIT,
      visit_records: [
        { id: 503, customer_id: SEED_CUSTOMERS.xyz.id, content: '自分の行' },
        { id: 505, customer_id: SEED_CUSTOMERS.def.id, content: '佐藤さんの行を書き換える' },
      ],
    })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'visit_records[1].id', message: UNKNOWN_VISIT_RECORD_MESSAGE }])
    expect(await snapshot(SEED_REPORTS.satoSubmitted.id)).toEqual(otherBefore)
    expect(await snapshot(SEED_REPORTS.submitted.id)).toEqual(ownBefore)
  })

  it('同じ訪問記録の id を 2 回送ると 400', async () => {
    const record = { id: 503, customer_id: SEED_CUSTOMERS.xyz.id, content: '行' }

    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, { ...SUBMIT, visit_records: [record, record] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details?.[0]?.field).toBe('visit_records[1].id')
  })

  it('追加・顧客を変えた行で、無効な顧客・存在しない顧客を指定すると 400（その行の customer_id）', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, {
      ...SUBMIT,
      visit_records: [
        { id: 503, customer_id: SEED_CUSTOMERS.old.id, content: '無効な顧客に変えた' },
        { customer_id: 9999, content: '存在しない顧客を追加' },
      ],
    })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([
      { field: 'visit_records[0].customer_id', message: INVALID_CUSTOMER_MESSAGE },
      { field: 'visit_records[1].customer_id', message: INVALID_CUSTOMER_MESSAGE },
    ])
  })

  it('既存の行で顧客を変えていなければ、その顧客が無効になっていても更新できる（決定事項 #36）', async () => {
    await prisma.customer.update({ where: { id: SEED_CUSTOMERS.xyz.id }, data: { isActive: false } })

    const response = await updateAs('yamada', SEED_REPORTS.submitted.id, {
      ...SUBMIT,
      visit_records: [{ id: 503, customer_id: SEED_CUSTOMERS.xyz.id, content: '内容だけ直す' }],
    })

    expect(response.status).toBe(200)
    expect(response.body.data.visit_records[0]).toMatchObject({ customer: { name: 'XYZ工業' }, content: '内容だけ直す' })
  })

  it('入力チェック（U-04）：提出なら Problem・Plan が必須', async () => {
    const response = await updateAs('yamada', SEED_REPORTS.draft.id, { ...SUBMIT, problem: '', visit_records: [] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'problem', message: 'Problemは必須です' }])
  })

  it('CSRF トークンがなければ 403', async () => {
    const { headers } = await loginAs('yamada')

    const response = await callRoute<Body>(PUT, `/api/v1/reports/${SEED_REPORTS.submitted.id}`, {
      method: 'PUT',
      params: { id: String(SEED_REPORTS.submitted.id) },
      body: { ...SUBMIT, visit_records: [] },
      headers: { cookie: headers.cookie },
    })

    expect(response.status).toBe(403)
    expect(response.body.error?.reason).toBe('CSRF_TOKEN_INVALID')
  })

  it('コメントの投稿中に本人が更新しても、コメントの付いた日報の内容は書き換わらない（決定事項 #15）', async () => {
    const reportId = SEED_REPORTS.submitted.id
    const before = await snapshot(reportId)
    let update: Promise<{ status: number; body: Body }> | undefined

    // コメントの投稿（C-01）と同じく、日報の行をロックしてからコメントを入れる。
    // ロックを持っている間に本人の更新を始め、更新がロックを待つことを確かめる
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM daily_reports WHERE id = ${reportId} FOR UPDATE`
        update = updateAs('yamada', reportId, { ...SUBMIT, problem: '書き換え', visit_records: [] })
        await new Promise((resolve) => setTimeout(resolve, 300))
        await tx.comment.create({
          data: { dailyReportId: reportId, commenterId: SEED_STAFF.suzuki.id, target: 'PROBLEM', body: '確認しました' },
        })
      },
      { timeout: 10_000 },
    )
    const response = await update!

    expect(response.status).toBe(409)
    expect(response.body.error?.reason).toBe('REPORT_LOCKED')
    expect(await snapshot(reportId)).toEqual(before)
  })
})
