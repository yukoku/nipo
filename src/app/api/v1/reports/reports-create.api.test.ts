import { describe, expect, it } from 'vitest'

import { CSRF_HEADER_NAME } from '@/lib/api-constants'
import { dataResponseSchema } from '@/schemas/response'
import { reportSchema } from '@/schemas/report'
import { prisma } from '@/server/db/prisma'
import { SEED_CUSTOMERS, SEED_STAFF } from '@/server/db/seed/data'
import { INVALID_CUSTOMER_MESSAGE } from '@/server/services/report'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'
import { TEST_BASE_DATE, setupFixedTime } from '@/test/time'

import { POST } from './route'

type Report = {
  id: number
  report_date: string
  sales_staff: { id: number; name: string }
  status: 'draft' | 'submitted'
  submitted_at: string | null
  problem: string | null
  plan: string | null
  visit_records: { id: number; customer: { id: number; name: string }; visited_at: string | null; content: string; sort_order: number }[]
  comments: unknown[]
  permissions: { can_edit: boolean; can_delete: boolean; can_comment: boolean }
}
type Body = {
  data: Report
  error?: { code: string; reason?: string; details?: { field: string; message: string }[] }
}

const SUBMITTED = {
  report_date: '2026-10-31',
  status: 'submitted',
  problem: 'XYZ工業の値引き要求について相談したい。',
  plan: 'ABC商事へ資料送付',
  visit_records: [
    { customer_id: SEED_CUSTOMERS.abc.id, visited_at: '10:00', content: '新商品の提案。' },
    { customer_id: SEED_CUSTOMERS.def.id, visited_at: '14:30', content: '見積提出。' },
  ],
}

const DRAFT = { report_date: '2026-10-31', status: 'draft', problem: '', plan: '', visit_records: [] }

async function createAs(staff: SeedStaffKey, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<Body>(POST, '/api/v1/reports', { method: 'POST', body, headers })
}

const visit = (content: string) => ({ customer_id: SEED_CUSTOMERS.abc.id, visited_at: null, content })

describe('POST /api/v1/reports（R-02）', () => {
  setupFixedTime() // 2026-10-31 10:00 JST

  it('T-RPT-01: 提出で作成すると 201。submitted_at が入り、sort_order は 1, 2', async () => {
    const response = await createAs('yamada', SUBMITTED)

    expect(response.status).toBe(201)
    expect(dataResponseSchema(reportSchema).safeParse(response.body).success).toBe(true)
    const report = response.body.data
    expect(response.headers.get('location')).toBe(`/api/v1/reports/${report.id}`)
    expect(report).toMatchObject({
      report_date: '2026-10-31',
      sales_staff: { id: SEED_STAFF.yamada.id, name: '山田太郎' },
      status: 'submitted',
      submitted_at: '2026-10-31T10:00:00+09:00',
      problem: SUBMITTED.problem,
      plan: SUBMITTED.plan,
      comments: [],
      permissions: { can_edit: true, can_delete: false, can_comment: false },
    })
    expect(report.visit_records.map((r) => [r.sort_order, r.customer.name, r.visited_at, r.content])).toEqual([
      [1, 'ABC商事', '10:00', '新商品の提案。'],
      [2, 'DEF物産', '14:30', '見積提出。'],
    ])
  })

  it('T-RPT-02: 下書き・訪問 0 件・Problem / Plan 空で作成すると 201、submitted_at は null', async () => {
    const response = await createAs('yamada', DRAFT)

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      status: 'draft',
      submitted_at: null,
      problem: null,
      plan: null,
      visit_records: [],
      permissions: { can_edit: true, can_delete: true, can_comment: false },
    })
  })

  it('T-RPT-03: 同じ日付の日報があれば 409 REPORT_ALREADY_EXISTS（M-04）', async () => {
    const response = await createAs('yamada', { ...DRAFT, report_date: '2026-10-30' })

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({
      code: 'CONFLICT',
      reason: 'REPORT_ALREADY_EXISTS',
      message: 'この日付の日報は既に作成されています',
    })
  })

  it('同時に同じ日付の日報を作成しても、1 件だけ作られ、もう一方は 409 になる（2 度押しの対策）', async () => {
    const { headers } = await loginAs('yamada')
    const send = () => callRoute<Body>(POST, '/api/v1/reports', { method: 'POST', body: DRAFT, headers })

    const responses = await Promise.all([send(), send(), send()])

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(responses.filter((r) => r.status === 409).every((r) => r.body.error?.reason === 'REPORT_ALREADY_EXISTS')).toBe(true)
    expect(await prisma.dailyReport.count({ where: { salesStaffId: SEED_STAFF.yamada.id } })).toBe(4)
  })

  it('T-RPT-04: 別の人なら同じ日付でも作成できる', async () => {
    expect((await createAs('yamada', DRAFT)).status).toBe(201)
    expect((await createAs('sato', DRAFT)).status).toBe(201)
  })

  it('T-RPT-05: 未来日（JST の明日）は 400。過去日は作成できる（決定事項 #9）', async () => {
    const future = await createAs('yamada', { ...DRAFT, report_date: '2026-11-01' })
    const past = await createAs('yamada', { ...DRAFT, report_date: '2026-04-01' })

    expect(future.status).toBe(400)
    expect(future.body.error?.details?.[0]?.field).toBe('report_date')
    expect(past.status).toBe(201)
  })

  it('T-RPT-06: 訪問記録 0 件でも提出できる（決定事項 #8）', async () => {
    const response = await createAs('yamada', { ...SUBMITTED, visit_records: [] })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({ status: 'submitted', visit_records: [] })
  })

  it('T-RPT-07・08: 提出時に Problem・Plan が空なら、それぞれの必須エラー（400）', async () => {
    const response = await createAs('yamada', { ...SUBMITTED, problem: '', plan: '  ' })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([
      { field: 'problem', message: 'Problemは必須です' },
      { field: 'plan', message: 'Planは必須です' },
    ])
  })

  it('T-RPT-09: 2 件目の訪問内容が空なら、field = visit_records[1].content の必須エラー', async () => {
    const response = await createAs('yamada', { ...SUBMITTED, visit_records: [visit('提案'), visit('')] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'visit_records[1].content', message: '訪問内容は必須です' }])
  })

  it('T-RPT-10・11: 無効な顧客・存在しない顧客は、その行の customer_id のエラー（400）。日報は作られない', async () => {
    const response = await createAs('yamada', {
      ...SUBMITTED,
      visit_records: [
        visit('有効'),
        { ...visit('無効'), customer_id: SEED_CUSTOMERS.old.id },
        { ...visit('存在しない'), customer_id: 9999 },
      ],
    })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([
      { field: 'visit_records[1].customer_id', message: INVALID_CUSTOMER_MESSAGE },
      { field: 'visit_records[2].customer_id', message: INVALID_CUSTOMER_MESSAGE },
    ])
    expect(await prisma.dailyReport.count({ where: { salesStaffId: SEED_STAFF.yamada.id } })).toBe(3)
  })

  it('T-CUS-10: 顧客を無効にすると、その顧客では日報を作成できない', async () => {
    await prisma.customer.update({ where: { id: SEED_CUSTOMERS.abc.id }, data: { isActive: false } })

    const response = await createAs('yamada', { ...DRAFT, visit_records: [visit('訪問')] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'visit_records[0].customer_id', message: INVALID_CUSTOMER_MESSAGE }])
  })

  it('同じ顧客を複数の行に入れてもよい', async () => {
    const response = await createAs('yamada', { ...DRAFT, visit_records: [visit('午前'), visit('午後')] })

    expect(response.status).toBe(201)
    expect(response.body.data.visit_records).toHaveLength(2)
  })

  it('T-RPT-12: Problem は 2,000 文字なら 201、2,001 文字なら 400', async () => {
    const ok = await createAs('yamada', { ...SUBMITTED, problem: 'あ'.repeat(2000) })
    const ng = await createAs('sato', { ...SUBMITTED, problem: 'あ'.repeat(2001) })

    expect(ok.status).toBe(201)
    expect(ok.body.data.problem).toHaveLength(2000)
    expect(ng.status).toBe(400)
    expect(ng.body.error?.details).toEqual([{ field: 'problem', message: 'Problemは2000文字以内で入力してください' }])
  })

  it('T-RPT-13: 訪問記録は 20 件なら 201（sort_order は 1〜20）、21 件なら 400', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => visit(`訪問${i + 1}`))
    const ok = await createAs('yamada', { ...DRAFT, visit_records: twenty })
    const ng = await createAs('sato', { ...DRAFT, visit_records: [...twenty, visit('21件目')] })

    expect(ok.status).toBe(201)
    expect(ok.body.data.visit_records.map((r) => r.sort_order)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(ng.status).toBe(400)
    expect(ng.body.error?.details?.[0]?.field).toBe('visit_records')
  })

  it.each(['25:00', 'abc'])('T-RPT-14: 訪問時刻が %s なら 400', async (visitedAt) => {
    const response = await createAs('yamada', { ...DRAFT, visit_records: [{ ...visit('訪問'), visited_at: visitedAt }] })

    expect(response.status).toBe(400)
    expect(response.body.error?.details?.[0]?.field).toBe('visit_records[0].visited_at')
  })

  it('T-RPT-15: リクエストに sales_staff_id を入れても無視し、担当者はログインユーザーになる', async () => {
    const response = await createAs('yamada', { ...DRAFT, sales_staff_id: SEED_STAFF.sato.id })

    expect(response.status).toBe(201)
    expect(response.body.data.sales_staff.id).toBe(SEED_STAFF.yamada.id)
    expect(await prisma.dailyReport.count({ where: { salesStaffId: SEED_STAFF.sato.id } })).toBe(2)
  })

  it('T-RPT-16: 管理者は作成できない（403）', async () => {
    const response = await createAs('admin', DRAFT)

    expect(response.status).toBe(403)
    expect(await prisma.dailyReport.count({ where: { salesStaffId: SEED_STAFF.admin.id } })).toBe(0)
  })

  it('上長も自分の日報を作成できる', async () => {
    const response = await createAs('suzuki', SUBMITTED)

    expect(response.status).toBe(201)
    expect(response.body.data.sales_staff.id).toBe(SEED_STAFF.suzuki.id)
  })

  it('T-AUTH-08: CSRF トークンがなければ 403（CSRF_TOKEN_INVALID）', async () => {
    const { headers } = await loginAs('yamada')
    const withoutToken = { cookie: headers.cookie }
    expect(headers).toHaveProperty(CSRF_HEADER_NAME)

    const response = await callRoute<Body>(POST, '/api/v1/reports', { method: 'POST', body: DRAFT, headers: withoutToken })

    expect(response.status).toBe(403)
    expect(response.body.error?.reason).toBe('CSRF_TOKEN_INVALID')
  })

  it('DB に保存した報告日・訪問時刻・提出日時が、タイムゾーンでずれない', async () => {
    const response = await createAs('yamada', SUBMITTED)

    const row = await prisma.dailyReport.findUniqueOrThrow({
      where: { id: response.body.data.id },
      select: { reportDate: true, submittedAt: true, visitRecords: { select: { visitedAt: true }, orderBy: { sortOrder: 'asc' } } },
    })
    expect(row.reportDate.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(row.submittedAt?.getTime()).toBe(TEST_BASE_DATE.getTime())
    expect(row.visitRecords.map((r) => r.visitedAt?.toISOString().slice(11, 16))).toEqual(['10:00', '14:30'])
  })
})
