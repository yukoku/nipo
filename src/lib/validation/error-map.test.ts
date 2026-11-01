import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createErrorMap } from '@/lib/validation/error-map'
import type { FieldLabels } from '@/lib/validation/field-labels'

/** スキーマで検証し、最初のエラーメッセージを返す */
function firstMessage(schema: z.ZodType, input: unknown, labels?: FieldLabels): string | undefined {
  const result = schema.safeParse(input, { error: createErrorMap(labels) })
  return result.error?.issues[0]?.message
}

describe('createErrorMap', () => {
  describe('必須（M-02）', () => {
    it('項目がない・null のとき「{項目名}は必須です」になる', () => {
      const schema = z.object({ problem: z.string() })
      expect(firstMessage(schema, {})).toBe('Problemは必須です')
      expect(firstMessage(schema, { problem: null })).toBe('Problemは必須です')
    })

    it('空文字・空白のみ（trim + min(1)）のとき「{項目名}は必須です」になる', () => {
      const schema = z.object({ content: z.string().trim().min(1) })
      expect(firstMessage(schema, { content: '' })).toBe('訪問内容は必須です')
      expect(firstMessage(schema, { content: '   ' })).toBe('訪問内容は必須です')
    })
  })

  describe('文字数（M-03）', () => {
    it('最大文字数を超えると「{項目名}は{n}文字以内で入力してください」になる', () => {
      const schema = z.object({ problem: z.string().max(2000) })
      expect(firstMessage(schema, { problem: 'あ'.repeat(2000) })).toBeUndefined()
      expect(firstMessage(schema, { problem: 'あ'.repeat(2001) })).toBe('Problemは2000文字以内で入力してください')
    })

    it('2 文字以上の最小文字数を下回ると「{項目名}は{n}文字以上で入力してください」になる', () => {
      expect(firstMessage(z.object({ password: z.string().min(8) }), { password: 'Pass0' })).toBe(
        'パスワードは8文字以上で入力してください',
      )
    })
  })

  describe('配列の件数', () => {
    it('上限・下限を外れると件数のメッセージになる', () => {
      const schema = z.object({ visit_records: z.array(z.string()).min(1).max(2) })
      expect(firstMessage(schema, { visit_records: ['a', 'b', 'c'] })).toBe('訪問記録は2件以内で入力してください')
      expect(firstMessage(schema, { visit_records: [] })).toBe('訪問記録は1件以上入力してください')
    })
  })

  describe('数値', () => {
    it('範囲を外れると「{n}以上」「{n}以下」のメッセージになる', () => {
      const schema = z.object({ per_page: z.number().min(1).max(100) })
      expect(firstMessage(schema, { per_page: 0 })).toBe('1ページの件数は1以上で入力してください')
      expect(firstMessage(schema, { per_page: 101 })).toBe('1ページの件数は100以下で入力してください')
    })

    it('境界を含まない指定（gt / lt）では「より大きい」「より小さい」のメッセージになる', () => {
      const schema = z.object({ page: z.number().gt(0).lt(10) })
      expect(firstMessage(schema, { page: 0 })).toBe('ページ番号は0より大きい値で入力してください')
      expect(firstMessage(schema, { page: 10 })).toBe('ページ番号は10より小さい値で入力してください')
    })

    it('数値でない値は「数値で入力してください」、整数でない値は「整数で入力してください」になる', () => {
      expect(firstMessage(z.object({ page: z.number() }), { page: 'abc' })).toBe('ページ番号は数値で入力してください')
      expect(firstMessage(z.object({ page: z.coerce.number() }), { page: 'abc' })).toBe(
        'ページ番号は数値で入力してください',
      )
      expect(firstMessage(z.object({ customer_id: z.int() }), { customer_id: 1.5 })).toBe('顧客は整数で入力してください')
    })
  })

  describe('その他の形式', () => {
    it('型が違う値は「{項目名}の形式が正しくありません」になる', () => {
      expect(firstMessage(z.object({ problem: z.string() }), { problem: 1 })).toBe('Problemの形式が正しくありません')
    })

    it('形式（メール・正規表現）が違うと「{項目名}の形式が正しくありません」になる', () => {
      expect(firstMessage(z.object({ email: z.email() }), { email: 'yamada' })).toBe('メールアドレスの形式が正しくありません')
      expect(firstMessage(z.object({ visited_at: z.string().regex(/^\d{2}:\d{2}$/) }), { visited_at: 'abc' })).toBe(
        '訪問時刻の形式が正しくありません',
      )
    })

    it('選択肢にない値は「{項目名}の値が正しくありません」になる', () => {
      expect(firstMessage(z.object({ target: z.enum(['problem', 'plan']) }), { target: 'other' })).toBe(
        'コメント対象の値が正しくありません',
      )
    })

    it('不明な項目（strict）は項目名を並べたメッセージになる', () => {
      expect(firstMessage(z.strictObject({}), { a: 1, b: 2 })).toBe('リクエストに不明な項目（a、b）が含まれています')
    })

    it('日付の範囲など、文字列・配列・数値以外の上限・下限は「値が正しくありません」になる', () => {
      const schema = z.object({ report_date: z.date().min(new Date('2026-01-01')).max(new Date('2026-12-31')) })
      expect(firstMessage(schema, { report_date: new Date('2025-12-31') })).toBe('報告日の値が正しくありません')
      expect(firstMessage(schema, { report_date: new Date('2027-01-01') })).toBe('報告日の値が正しくありません')
    })
  })

  it('スキーマでメッセージを指定した場合は、そちらが優先される', () => {
    const schema = z.object({ body: z.string().refine((v) => v.trim() !== '', { message: '空白のみは不可' }) })
    expect(firstMessage(schema, { body: ' ' })).toBe('空白のみは不可')
  })

  it('項目名を上書きできる', () => {
    expect(firstMessage(z.object({ name: z.string() }), {}, { name: '顧客名' })).toBe('顧客名は必須です')
  })
})
