import { z } from 'zod'

import { isFutureDate, isValidDateString, isValidTimeString } from '@/lib/date'
import { idSchema } from '@/schemas/id'
import { optionalText } from '@/schemas/text'

/**
 * 日報・訪問記録のスキーマ（docs/api.md §4 R-02・R-04）。
 *
 * API の入力チェックと、日報作成・編集画面（SC-03）のフォームの入力チェックで同じものを使う。
 * 「下書き保存」と「提出」で必須の項目が変わる（提出のときだけ Problem・Plan が必須）。
 * 訪問記録は 0 件でも提出できる（決定事項 #8。M-05 は欠番）
 */

/** 日報の項目の上限（docs/api.md R-02、docs/screens.md SC-03） */
export const REPORT_LIMITS = {
  /** Problem・Plan・訪問内容の最大文字数 */
  text: 2000,
  /** 1 件の日報に登録できる訪問記録の最大件数 */
  visitRecords: 20,
} as const

/** 報告日に未来の日付を指定したときのメッセージ（T-RPT-05。決定事項 #9） */
export const FUTURE_REPORT_DATE_MESSAGE = '報告日に未来の日付は指定できません'

/** 報告日の形式が正しくないときのメッセージ */
export const REPORT_DATE_FORMAT_MESSAGE = '報告日は YYYY-MM-DD の形式で、実在する日付を入力してください'

/** 訪問時刻の形式が正しくないときのメッセージ（T-RPT-14） */
export const VISITED_AT_FORMAT_MESSAGE = '訪問時刻は HH:mm の形式（00:00〜23:59）で入力してください'

/** 更新（R-04）で同じ訪問記録の `id` を 2 回以上送ったときのメッセージ */
export const DUPLICATE_VISIT_RECORD_MESSAGE = '同じ訪問記録が重複しています'

/** 日報のステータス（API の値） */
export const reportStatusSchema = z
  .enum(['draft', 'submitted'])
  .meta({ id: 'ReportStatus', description: '`draft`（下書き）/ `submitted`（提出済み）' })

/**
 * 報告日（`YYYY-MM-DD`）。実在する日付で、JST の今日より後でないこと（決定事項 #9：過去日は作成できる）。
 * タイムゾーンを持たない暦の日付として、受け取った文字列のまま扱う（docs/api.md §1.1）
 */
export const reportDateSchema = z
  .string()
  .trim()
  // 空なら「必須」（M-02）だけを出す（形式のエラーを重ねない）
  .min(1, { abort: true })
  .refine(isValidDateString, { error: REPORT_DATE_FORMAT_MESSAGE, abort: true })
  .refine((value) => !isFutureDate(value), { error: FUTURE_REPORT_DATE_MESSAGE })
  .meta({ description: '報告日（JST の暦の日付）。未来日は指定できない', example: '2026-10-31' })

/** 訪問時刻（`HH:mm`）。任意。省略・`null`・空文字は未入力（`null`） */
const visitedAtSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || isValidTimeString(value), { error: VISITED_AT_FORMAT_MESSAGE })
  .meta({ description: '訪問時刻（`HH:mm`。JST の暦の時刻）。未入力なら null', example: '10:00' })

/**
 * 訪問記録の 1 行（R-02）。下書き保存のときも、送られた行は顧客・訪問内容を必須にする
 * （空の行は画面側で取り除いてから送る。docs/api.md R-02）
 */
export const visitRecordSchema = z.object({
  customer_id: idSchema.meta({ description: '訪問した顧客の ID。有効な顧客であること', example: 10 }),
  visited_at: visitedAtSchema,
  content: z
    .string()
    .trim()
    .min(1)
    .max(REPORT_LIMITS.text)
    .meta({ description: '訪問内容', example: '新商品の提案。先方部長が興味あり。' }),
})

/** 訪問記録の 1 行（R-04）。既存の行を残すときは `id` を付ける。`id` がない行は追加になる */
export const visitRecordUpdateSchema = visitRecordSchema.extend({
  id: idSchema.optional().meta({ description: '既存の訪問記録の ID。省略すると新しい行として追加する', example: 501 }),
})

/** Problem・Plan（任意。提出のときだけ必須）。空文字・空白だけは未入力（`null`） */
function reportText(description: string, example: string) {
  return optionalText(REPORT_LIMITS.text).meta({ description, example })
}

/** 日報の本文の項目（R-02・R-04 で共通） */
const reportBodyFields = {
  status: reportStatusSchema,
  problem: reportText('課題・相談（提出時は必須）', 'XYZ工業の値引き要求にどこまで応じるべきか相談したい。'),
  plan: reportText('明日やること（提出時は必須）', 'ABC商事へ資料送付、DEF社アポ取り'),
}

/**
 * 提出（`status = submitted`）のときだけ、Problem・Plan を必須にする（U-04・T-RPT-07・08）。
 * 他の項目にエラーがあっても確かめる（エラーをまとめて表示するため）
 */
function requireTextsWhenSubmitted(
  value: { status: string; problem: string | null; plan: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.status !== 'submitted') {
    return
  }
  for (const field of ['problem', 'plan'] as const) {
    if (value[field] === null) {
      // 項目がないのと同じ扱いにして、エラーマップで「{項目名}は必須です」（M-02）にする
      ctx.addIssue({ code: 'invalid_type', expected: 'string', input: null, path: [field] })
    }
  }
}

/** R-04 で、同じ訪問記録の `id` が 2 回以上送られていないか（全件置き換えの対応が決まらなくなるため） */
function rejectDuplicateVisitRecordIds(value: { visit_records: { id?: number }[] }, ctx: z.RefinementCtx): void {
  const seen = new Set<number>()
  value.visit_records.forEach((record, index) => {
    if (record.id === undefined) {
      return
    }
    if (seen.has(record.id)) {
      ctx.addIssue({ code: 'custom', path: ['visit_records', index, 'id'], message: DUPLICATE_VISIT_RECORD_MESSAGE })
    }
    seen.add(record.id)
  })
}

/** R-02 日報作成のリクエスト。担当者はログインユーザーで固定（`sales_staff_id` などは受け取らない。T-RPT-15） */
export const reportCreateRequestSchema = z
  .object({
    report_date: reportDateSchema,
    ...reportBodyFields,
    visit_records: z
      .array(visitRecordSchema)
      .max(REPORT_LIMITS.visitRecords)
      .meta({ description: '訪問記録（0〜20 件）。配列の順に sort_order を 1 から付ける' }),
  })
  .superRefine(requireTextsWhenSubmitted)

/**
 * R-04 日報更新のリクエスト。`report_date` は受け取らない（送られても無視する。T-RPT-66）。
 * `visit_records` は全件置き換え（`id` 付きは更新、`id` なしは追加、送られなかった既存行は削除）
 */
export const reportUpdateRequestSchema = z
  .object({
    ...reportBodyFields,
    visit_records: z
      .array(visitRecordUpdateSchema)
      .max(REPORT_LIMITS.visitRecords)
      .meta({ description: '訪問記録（0〜20 件）の全件。既存の行を残すときは id を付ける' }),
  })
  .superRefine(requireTextsWhenSubmitted)
  .superRefine(rejectDuplicateVisitRecordIds)

export type ReportStatus = z.output<typeof reportStatusSchema>
export type VisitRecordInput = z.output<typeof visitRecordSchema>
export type VisitRecordUpdateInput = z.output<typeof visitRecordUpdateSchema>
export type ReportCreateRequest = z.output<typeof reportCreateRequestSchema>
export type ReportUpdateRequest = z.output<typeof reportUpdateRequestSchema>
