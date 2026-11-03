import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'
import { setupFixedTime } from '@/test/time'

import {
  DUPLICATE_VISIT_RECORD_MESSAGE,
  FUTURE_REPORT_DATE_MESSAGE,
  REPORT_DATE_FORMAT_MESSAGE,
  REPORT_LIMITS,
  VISITED_AT_FORMAT_MESSAGE,
  reportCreateRequestSchema,
  reportUpdateRequestSchema,
} from './report'

const VISIT = { customer_id: 10, visited_at: '10:00', content: '新商品の提案。' }

const SUBMITTED = {
  report_date: '2026-10-31',
  status: 'submitted',
  problem: 'XYZ工業の値引き要求について相談したい。',
  plan: 'ABC商事へ資料送付',
  visit_records: [VISIT, { customer_id: 12, visited_at: '14:30', content: '見積提出。' }],
}

const DRAFT = { report_date: '2026-10-31', status: 'draft', problem: '', plan: '', visit_records: [] }

const UPDATE = {
  status: 'submitted',
  problem: '相談したい。',
  plan: '資料送付',
  visit_records: [{ id: 501, ...VISIT }, VISIT],
}

type Schema = typeof reportCreateRequestSchema | typeof reportUpdateRequestSchema

/** API と同じエラーマップで検証し、`項目のパス → メッセージ` を返す（エラーがなければ空） */
function errors(schema: Schema, input: unknown): Record<string, string> {
  const result = schema.safeParse(input, { error: createErrorMap() })
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

const text = (length: number) => 'あ'.repeat(length)
const visits = (count: number) => Array.from({ length: count }, () => VISIT)

describe('reportCreateRequestSchema（R-02）', () => {
  setupFixedTime() // 2026-10-31 10:00 JST

  it('提出：全項目が正しければ通り、文字列の前後の空白を除く', () => {
    const parsed = reportCreateRequestSchema.parse({ ...SUBMITTED, problem: ' 相談 ', visit_records: [{ ...VISIT, content: ' 提案 ' }] })

    expect(parsed).toEqual({
      report_date: '2026-10-31',
      status: 'submitted',
      problem: '相談',
      plan: 'ABC商事へ資料送付',
      visit_records: [{ customer_id: 10, visited_at: '10:00', content: '提案' }],
    })
  })

  it('U-04: 下書きなら Problem・Plan は空でよい（空文字・空白・省略・null は null）', () => {
    expect(reportCreateRequestSchema.parse(DRAFT)).toMatchObject({ status: 'draft', problem: null, plan: null })
    expect(reportCreateRequestSchema.parse({ ...DRAFT, problem: '   ', plan: undefined })).toMatchObject({ problem: null, plan: null })
    expect(reportCreateRequestSchema.parse({ ...DRAFT, problem: null, plan: null })).toMatchObject({ problem: null, plan: null })
  })

  it('U-04・T-RPT-07・08: 提出なら Problem・Plan が必須（M-02）', () => {
    expect(errors(reportCreateRequestSchema, { ...SUBMITTED, problem: '', plan: '  ' })).toEqual({
      problem: 'Problemは必須です',
      plan: 'Planは必須です',
    })
    expect(errors(reportCreateRequestSchema, { ...SUBMITTED, problem: undefined })).toEqual({ problem: 'Problemは必須です' })
  })

  it('T-RPT-06: 訪問記録 0 件でも提出できる（決定事項 #8）', () => {
    expect(reportCreateRequestSchema.parse({ ...SUBMITTED, visit_records: [] }).visit_records).toEqual([])
  })

  it('U-04・T-RPT-12: Problem・Plan・訪問内容は 2,000 文字まで。2,001 文字はエラー（M-03）', () => {
    expect(REPORT_LIMITS.text).toBe(2000)
    const ok = { ...SUBMITTED, problem: text(2000), plan: text(2000), visit_records: [{ ...VISIT, content: text(2000) }] }
    expect(errors(reportCreateRequestSchema, ok)).toEqual({})

    const ng = { ...SUBMITTED, problem: text(2001), plan: text(2001), visit_records: [{ ...VISIT, content: text(2001) }] }
    expect(errors(reportCreateRequestSchema, ng)).toEqual({
      problem: 'Problemは2000文字以内で入力してください',
      plan: 'Planは2000文字以内で入力してください',
      'visit_records.0.content': '訪問内容は2000文字以内で入力してください',
    })
  })

  it('T-RPT-13: 訪問記録は 20 件まで。21 件はエラー', () => {
    expect(errors(reportCreateRequestSchema, { ...SUBMITTED, visit_records: visits(20) })).toEqual({})
    expect(errors(reportCreateRequestSchema, { ...SUBMITTED, visit_records: visits(21) })).toEqual({
      visit_records: '訪問記録は20件以内で入力してください',
    })
  })

  it('T-RPT-09: 下書きでも、送られた訪問記録の行は顧客・訪問内容が必須', () => {
    const input = { ...DRAFT, visit_records: [VISIT, { customer_id: null, visited_at: '', content: '' }] }

    expect(errors(reportCreateRequestSchema, input)).toEqual({
      'visit_records.1.customer_id': '顧客は必須です',
      'visit_records.1.content': '訪問内容は必須です',
    })
  })

  it('訪問時刻は任意。省略・null・空文字は null になる', () => {
    const records = [{ customer_id: 10, content: 'a' }, { ...VISIT, visited_at: null }, { ...VISIT, visited_at: ' ' }]

    expect(reportCreateRequestSchema.parse({ ...DRAFT, visit_records: records }).visit_records.map((r) => r.visited_at)).toEqual([
      null,
      null,
      null,
    ])
  })

  it.each(['25:00', 'abc', '9:00', '10:60', '10:00:00'])('T-RPT-14: 訪問時刻が %s ならエラー', (visitedAt) => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, visit_records: [{ ...VISIT, visited_at: visitedAt }] })).toEqual({
      'visit_records.0.visited_at': VISITED_AT_FORMAT_MESSAGE,
    })
  })

  it('訪問時刻は 00:00〜23:59 を受け付ける', () => {
    for (const visitedAt of ['00:00', '09:05', '23:59']) {
      expect(errors(reportCreateRequestSchema, { ...DRAFT, visit_records: [{ ...VISIT, visited_at: visitedAt }] })).toEqual({})
    }
  })

  it('顧客 ID は 1 以上の整数', () => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, visit_records: [{ ...VISIT, customer_id: 0 }] })).toHaveProperty(
      'visit_records.0.customer_id',
    )
    expect(errors(reportCreateRequestSchema, { ...DRAFT, visit_records: [{ ...VISIT, customer_id: 1.5 }] })).toHaveProperty(
      'visit_records.0.customer_id',
    )
  })

  it('報告日は必須', () => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '' })).toEqual({ report_date: '報告日は必須です' })
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: undefined })).toEqual({ report_date: '報告日は必須です' })
  })

  it.each(['2026/10/31', '2026-02-30', '2026-13-01', 'abc'])('報告日が %s なら形式エラー（未来日の判定はしない）', (date) => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: date })).toEqual({ report_date: REPORT_DATE_FORMAT_MESSAGE })
  })

  it('T-RPT-05: 報告日は今日まで。明日（未来日）はエラー。過去日は作成できる（決定事項 #9）', () => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '2026-10-31' })).toEqual({})
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '2025-04-01' })).toEqual({})
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '2026-11-01' })).toEqual({
      report_date: FUTURE_REPORT_DATE_MESSAGE,
    })
  })

  it('ステータス・訪問記録は必須。ステータスは draft / submitted だけ', () => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, status: undefined, visit_records: undefined })).toEqual({
      status: 'ステータスは必須です',
      visit_records: '訪問記録は必須です',
    })
    expect(errors(reportCreateRequestSchema, { ...DRAFT, status: 'approved' })).toEqual({ status: 'ステータスの値が正しくありません' })
  })

  it('T-RPT-15: 担当者（sales_staff_id）など、定義にない項目は受け取らない', () => {
    const parsed = reportCreateRequestSchema.parse({ ...DRAFT, sales_staff_id: 3, visit_records: [{ ...VISIT, id: 501 }] })

    expect(parsed).not.toHaveProperty('sales_staff_id')
    expect(parsed.visit_records[0]).not.toHaveProperty('id')
  })

  it('他の項目にエラーがあっても、提出時の必須エラーを一緒に出す', () => {
    expect(errors(reportCreateRequestSchema, { ...SUBMITTED, report_date: '2026-11-01', problem: '' })).toEqual({
      report_date: FUTURE_REPORT_DATE_MESSAGE,
      problem: 'Problemは必須です',
    })
  })
})

describe('報告日の「今日」は JST で判定する', () => {
  // UTC では 10/31 15:00 だが、JST では 11/1 の 0:00（docs/api.md §1.1 の例）
  setupFixedTime(new Date('2026-10-31T15:00:00Z'))

  it('JST で日付が変わった直後は、11/1 を今日として受け付ける', () => {
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '2026-11-01' })).toEqual({})
    expect(errors(reportCreateRequestSchema, { ...DRAFT, report_date: '2026-11-02' })).toEqual({
      report_date: FUTURE_REPORT_DATE_MESSAGE,
    })
  })
})

describe('reportUpdateRequestSchema（R-04）', () => {
  it('既存の行は id 付き、追加の行は id なしで受け取る', () => {
    const parsed = reportUpdateRequestSchema.parse(UPDATE)

    expect(parsed.visit_records).toEqual([{ id: 501, ...VISIT }, VISIT])
  })

  it('T-RPT-66: 報告日は受け取らない（送られても無視する）', () => {
    expect(reportUpdateRequestSchema.parse({ ...UPDATE, report_date: '2026-10-25' })).not.toHaveProperty('report_date')
  })

  it('U-04: 提出なら Problem・Plan が必須。下書きなら空でよい', () => {
    expect(errors(reportUpdateRequestSchema, { ...UPDATE, problem: '', plan: null })).toEqual({
      problem: 'Problemは必須です',
      plan: 'Planは必須です',
    })
    expect(errors(reportUpdateRequestSchema, { ...UPDATE, status: 'draft', problem: '', plan: null })).toEqual({})
  })

  it('U-04: 文字数（2,000 / 2,001）と訪問記録の件数（20 / 21）の上限は作成と同じ', () => {
    expect(errors(reportUpdateRequestSchema, { ...UPDATE, problem: text(2000), visit_records: visits(20) })).toEqual({})
    expect(errors(reportUpdateRequestSchema, { ...UPDATE, problem: text(2001), visit_records: visits(21) })).toEqual({
      problem: 'Problemは2000文字以内で入力してください',
      visit_records: '訪問記録は20件以内で入力してください',
    })
  })

  it('訪問記録の id は 1 以上の整数', () => {
    expect(errors(reportUpdateRequestSchema, { ...UPDATE, visit_records: [{ ...VISIT, id: 0 }] })).toHaveProperty(
      'visit_records.0.id',
    )
  })

  it('同じ訪問記録の id を 2 回以上送るとエラー（2 回目以降の行に出す）', () => {
    const input = { ...UPDATE, visit_records: [{ id: 501, ...VISIT }, VISIT, { id: 502, ...VISIT }, { id: 501, ...VISIT }] }

    expect(errors(reportUpdateRequestSchema, input)).toEqual({ 'visit_records.3.id': DUPLICATE_VISIT_RECORD_MESSAGE })
  })
})
