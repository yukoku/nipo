import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'
import {
  CUSTOMER_FIELD_LABELS,
  customerCreateRequestSchema,
  customerListQuerySchema,
  customerUpdateRequestSchema,
} from '@/schemas/customer'

const errorMap = { error: createErrorMap(CUSTOMER_FIELD_LABELS) }
const parseCreate = (input: unknown) => customerCreateRequestSchema.safeParse(input, errorMap)
const parseUpdate = (input: unknown) => customerUpdateRequestSchema.safeParse(input, errorMap)
const parseQuery = (input: Record<string, string>) => customerListQuerySchema.safeParse(input, errorMap)

/** エラーを `{ 項目名: メッセージ }` にする */
function errorsOf(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))
}

describe('customerCreateRequestSchema（M-02）', () => {
  it('全項目を受け付け、前後の空白を除く', () => {
    const result = parseCreate({
      name: ' ABC商事 ',
      contact_person: '田中様',
      phone: '03-1234-5678',
      address: '東京都千代田区',
      assigned_sales_id: 2,
    })

    expect(result.data).toEqual({
      name: 'ABC商事',
      contact_person: '田中様',
      phone: '03-1234-5678',
      address: '東京都千代田区',
      assigned_sales_id: 2,
    })
  })

  it('任意項目は、省略・null・空文字・空白のみをすべて null にする', () => {
    expect(parseCreate({ name: 'A' }).data).toEqual({
      name: 'A',
      contact_person: null,
      phone: null,
      address: null,
      assigned_sales_id: null,
    })
    expect(
      parseCreate({ name: 'A', contact_person: '', phone: '  ', address: null, assigned_sales_id: null }).data,
    ).toEqual({ name: 'A', contact_person: null, phone: null, address: null, assigned_sales_id: null })
  })

  it('T-CUS-02: 顧客名が空・空白のみ・省略なら必須エラー', () => {
    for (const name of ['', '   ', undefined]) {
      expect(errorsOf(parseCreate({ name }))).toEqual({ name: '顧客名は必須です' })
    }
  })

  it('T-CUS-02: 顧客名は 100 文字まで', () => {
    expect(parseCreate({ name: 'あ'.repeat(100) }).success).toBe(true)
    expect(errorsOf(parseCreate({ name: 'あ'.repeat(101) }))).toEqual({ name: '顧客名は100文字以内で入力してください' })
  })

  it('先方担当者は 50 文字、住所は 200 文字まで', () => {
    expect(parseCreate({ name: 'A', contact_person: 'あ'.repeat(50), address: 'あ'.repeat(200) }).success).toBe(true)
    expect(errorsOf(parseCreate({ name: 'A', contact_person: 'あ'.repeat(51), address: 'あ'.repeat(201) }))).toEqual({
      contact_person: '先方担当者は50文字以内で入力してください',
      address: '住所は200文字以内で入力してください',
    })
  })

  it('T-CUS-03: 電話番号は数字とハイフンのみ', () => {
    expect(parseCreate({ name: 'A', phone: '03-1234-5678' }).success).toBe(true)
    for (const phone of ['03(1234)5678', '03 1234 5678', '０３-１２３４', 'abc']) {
      expect(errorsOf(parseCreate({ name: 'A', phone }))).toEqual({ phone: '電話番号は数字とハイフンで入力してください' })
    }
  })

  it('電話番号は 20 文字まで', () => {
    expect(parseCreate({ name: 'A', phone: '0'.repeat(20) }).success).toBe(true)
    expect(errorsOf(parseCreate({ name: 'A', phone: '0'.repeat(21) }))).toEqual({
      phone: '電話番号は20文字以内で入力してください',
    })
  })

  it.each([
    [0, '担当営業は1以上で入力してください'],
    [1.5, '担当営業は整数で入力してください'],
    [2_147_483_648, '担当営業は2147483647以下で入力してください'],
    ['2', '担当営業は数値で入力してください'],
  ])('担当営業の ID が %s ならエラー', (assignedSalesId, message) => {
    expect(errorsOf(parseCreate({ name: 'A', assigned_sales_id: assignedSalesId }))).toEqual({
      assigned_sales_id: message,
    })
  })
})

describe('customerUpdateRequestSchema（M-04）', () => {
  it('M-02 の項目に加えて is_active を受け付ける', () => {
    expect(parseUpdate({ name: 'A', is_active: false }).data).toMatchObject({ name: 'A', is_active: false })
  })

  it('is_active は必須で、真偽値に限る', () => {
    expect(errorsOf(parseUpdate({ name: 'A' }))).toEqual({ is_active: '状態は必須です' })
    expect(errorsOf(parseUpdate({ name: 'A', is_active: 'true' }))).toEqual({ is_active: '状態の形式が正しくありません' })
  })
})

describe('customerListQuerySchema（M-01）', () => {
  it('指定がなければ、無効な顧客を含めず 1 ページ目を返す条件になる', () => {
    expect(parseQuery({}).data).toEqual({ page: 1, per_page: 20, include_inactive: false })
  })

  it('空の値は指定なしとして扱う', () => {
    expect(parseQuery({ name: '', assigned_sales_id: '', include_inactive: '' }).data).toEqual({
      page: 1,
      per_page: 20,
      include_inactive: false,
    })
  })

  it('クエリ文字列を数値・真偽値にする', () => {
    expect(parseQuery({ name: ' 商事 ', assigned_sales_id: '2', include_inactive: 'true' }).data).toEqual({
      page: 1,
      per_page: 20,
      name: '商事',
      assigned_sales_id: 2,
      include_inactive: true,
    })
    expect(parseQuery({ include_inactive: 'false' }).data?.include_inactive).toBe(false)
  })

  it('不正な値はエラーになる', () => {
    expect(errorsOf(parseQuery({ assigned_sales_id: 'abc', include_inactive: 'yes' }))).toEqual({
      assigned_sales_id: '担当営業は数値で入力してください',
      include_inactive: '無効も表示の値が正しくありません',
    })
  })
})
