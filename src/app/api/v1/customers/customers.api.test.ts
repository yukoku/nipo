import { describe, expect, it } from 'vitest'

import { customerSchema } from '@/schemas/customer'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'
import { prisma } from '@/server/db/prisma'
import { SEED_CUSTOMERS, SEED_STAFF } from '@/server/db/seed/data'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'

import { GET as getOne, PUT } from './[id]/route'
import { GET as list, POST } from './route'

type Customer = { id: number; name: string; is_active: boolean; assigned_sales: { id: number; name: string } | null }
type ListBody = { data: Customer[]; meta: { total_count: number; total_pages: number } }

const FULL_INPUT = {
  name: 'GHI商会',
  contact_person: '佐々木様',
  phone: '045-123-4567',
  address: '神奈川県横浜市西区1-1-1',
  assigned_sales_id: SEED_STAFF.sato.id,
}

async function listAs(staff: SeedStaffKey, query: Record<string, string | number | boolean | undefined> = {}) {
  const { headers } = await loginAs(staff)
  return callRoute<ListBody>(list, '/api/v1/customers', { query, headers })
}

async function createAs(staff: SeedStaffKey, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute(POST, '/api/v1/customers', { method: 'POST', body, headers })
}

async function getAs(staff: SeedStaffKey, id: string | number) {
  const { headers } = await loginAs(staff)
  return callRoute(getOne, `/api/v1/customers/${id}`, { params: { id: String(id) }, headers })
}

async function updateAs(staff: SeedStaffKey, id: string | number, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute(PUT, `/api/v1/customers/${id}`, { method: 'PUT', params: { id: String(id) }, body, headers })
}

const namesOf = (body: ListBody) => body.data.map((customer) => customer.name)

describe('GET /api/v1/customers（M-01）', () => {
  it('管理者は有効な顧客を顧客名の昇順で取得できる', async () => {
    const response = await listAs('admin')

    expect(response.status).toBe(200)
    expect(listResponseSchema(customerSchema).safeParse(response.body).success).toBe(true)
    expect(namesOf(response.body)).toEqual(['ABC商事', 'DEF物産', 'XYZ工業'])
    expect(response.body.meta).toEqual({ page: 1, per_page: 20, total_count: 3, total_pages: 1 })
    expect(response.body.data[0]).toEqual({
      id: SEED_CUSTOMERS.abc.id,
      name: 'ABC商事',
      contact_person: '田中様',
      phone: '03-1234-5678',
      address: '東京都千代田区丸の内1-1-1',
      assigned_sales: { id: SEED_STAFF.yamada.id, name: '山田太郎' },
      is_active: true,
      created_at: expect.stringMatching(/\+09:00$/),
      updated_at: expect.stringMatching(/\+09:00$/),
    })
  })

  it('T-CUS-06: 営業は include_inactive=true を指定しても有効な顧客だけを取得する', async () => {
    const response = await listAs('yamada', { include_inactive: true })

    expect(response.status).toBe(200)
    expect(namesOf(response.body)).toEqual(['ABC商事', 'DEF物産', 'XYZ工業'])
  })

  it('上長も include_inactive=true は無視される', async () => {
    const response = await listAs('suzuki', { include_inactive: true })

    expect(namesOf(response.body)).not.toContain('旧取引先')
  })

  it('T-CUS-07: 管理者は include_inactive=true で無効な顧客も取得できる', async () => {
    const response = await listAs('admin', { include_inactive: true })

    expect(response.body.data.map((customer) => customer.id)).toContain(SEED_CUSTOMERS.old.id)
    expect(response.body.meta.total_count).toBe(4)
  })

  it('T-CUS-08: 顧客名の部分一致で絞り込める', async () => {
    const response = await listAs('admin', { name: '商事' })

    expect(namesOf(response.body)).toEqual(['ABC商事'])
  })

  it('顧客名の検索は英字の大文字・小文字を区別しない', async () => {
    const response = await listAs('admin', { name: 'abc' })

    expect(namesOf(response.body)).toEqual(['ABC商事'])
  })

  it('担当営業で絞り込める', async () => {
    const response = await listAs('admin', { assigned_sales_id: SEED_STAFF.sato.id })

    expect(namesOf(response.body)).toEqual(['DEF物産'])
  })

  it('T-NF-06: 検索条件に SQL を入れてもエラーにならず、該当なしになる', async () => {
    const response = await listAs('admin', { name: "' OR 1=1 --" })

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([])
    expect(response.body.meta.total_pages).toBe(0)
  })

  it('ページングできる', async () => {
    const response = await listAs('admin', { page: 2, per_page: 2 })

    expect(namesOf(response.body)).toEqual(['XYZ工業'])
    expect(response.body.meta).toEqual({ page: 2, per_page: 2, total_count: 3, total_pages: 2 })
  })

  it('クエリが不正なら 400', async () => {
    const response = await listAs('admin', { assigned_sales_id: 'abc' })

    expect(response).toMatchObject({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', details: [{ field: 'assigned_sales_id', message: '担当営業は数値で入力してください' }] } },
    })
  })

  it('ログインしていなければ 401', async () => {
    const response = await callRoute(list, '/api/v1/customers')

    expect(response.status).toBe(401)
  })
})

describe('POST /api/v1/customers（M-02）', () => {
  it('T-CUS-01: 管理者が全項目を入力して登録すると 201、is_active=true', async () => {
    const response = await createAs('admin', FULL_INPUT)

    expect(response.status).toBe(201)
    expect(dataResponseSchema(customerSchema).safeParse(response.body).success).toBe(true)
    const { data } = response.body as { data: Customer & Record<string, unknown> }
    expect(data).toMatchObject({
      name: 'GHI商会',
      contact_person: '佐々木様',
      phone: '045-123-4567',
      address: '神奈川県横浜市西区1-1-1',
      assigned_sales: { id: SEED_STAFF.sato.id, name: '佐藤花子' },
      is_active: true,
    })
    expect(response.headers.get('location')).toBe(`/api/v1/customers/${data.id}`)
    expect(await prisma.customer.findUnique({ where: { id: data.id } })).toMatchObject({
      name: 'GHI商会',
      isActive: true,
    })
  })

  it('任意項目を省略・空文字にすると未設定（null）で登録する', async () => {
    const response = await createAs('admin', { name: '新規顧客', contact_person: '', phone: '' })

    expect(response.status).toBe(201)
    expect((response.body as { data: Record<string, unknown> }).data).toMatchObject({
      contact_person: null,
      phone: null,
      address: null,
      assigned_sales: null,
    })
  })

  it('リクエストの is_active は無視し、有効で登録する', async () => {
    const response = await createAs('admin', { name: '新規顧客', is_active: false })

    expect((response.body as { data: Customer }).data.is_active).toBe(true)
  })

  it('担当営業には上長も指定できる', async () => {
    const response = await createAs('admin', { name: '新規顧客', assigned_sales_id: SEED_STAFF.suzuki.id })

    expect(response.status).toBe(201)
  })

  it.each([
    ['空', ''],
    ['101 文字', 'あ'.repeat(101)],
  ])('T-CUS-02: 顧客名が%sなら 400', async (_, name) => {
    const response = await createAs('admin', { ...FULL_INPUT, name })

    expect(response).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } })
    expect((response.body as { error: { details: { field: string }[] } }).error.details).toEqual([
      { field: 'name', message: expect.stringMatching(/^顧客名は/) },
    ])
  })

  it('T-CUS-02: 顧客名が 100 文字なら登録できる', async () => {
    const response = await createAs('admin', { ...FULL_INPUT, name: 'あ'.repeat(100) })

    expect(response.status).toBe(201)
  })

  it('T-CUS-03: 電話番号は正しい形式なら 201、括弧を含めば 400', async () => {
    expect((await createAs('admin', { ...FULL_INPUT, phone: '03-1234-5678' })).status).toBe(201)

    const response = await createAs('admin', { ...FULL_INPUT, phone: '03(1234)5678' })
    expect(response).toMatchObject({
      status: 400,
      body: { error: { details: [{ field: 'phone', message: '電話番号の形式が正しくありません（例：03-1234-5678）' }] } },
    })
  })

  it('T-CUS-03: 数字とハイフンだけでも、電話番号の形でなければ 400', async () => {
    for (const phone of ['--1-', '0', '03--1234-5678', '1234-5678-9012']) {
      const response = await createAs('admin', { ...FULL_INPUT, phone })

      expect(response).toMatchObject({ status: 400, body: { error: { details: [{ field: 'phone' }] } } })
    }
    expect(await prisma.customer.count({ where: { name: FULL_INPUT.name } })).toBe(0)
  })

  it.each([
    ['T-CUS-04: 無効な営業（退職者）', SEED_STAFF.retired.id],
    ['存在しない営業', 9999],
    ['管理者', SEED_STAFF.admin.id],
  ])('%sを担当営業にすると 400', async (_, assignedSalesId) => {
    const response = await createAs('admin', { ...FULL_INPUT, assigned_sales_id: assignedSalesId })

    expect(response).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'assigned_sales_id', message: '担当営業には有効な営業担当者を指定してください' }],
        },
      },
    })
    expect(await prisma.customer.count({ where: { name: FULL_INPUT.name } })).toBe(0)
  })

  it.each<SeedStaffKey>(['yamada', 'suzuki'])('T-CUS-05: 管理者以外（%s）は登録できず 403', async (staff) => {
    const response = await createAs(staff, FULL_INPUT)

    expect(response).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    expect(await prisma.customer.count({ where: { name: FULL_INPUT.name } })).toBe(0)
  })

  it('CSRF トークンがなければ 403', async () => {
    const { headers } = await loginAs('admin')
    const response = await callRoute(POST, '/api/v1/customers', {
      method: 'POST',
      body: FULL_INPUT,
      headers: { cookie: headers.cookie },
    })

    expect(response).toMatchObject({ status: 403, body: { error: { reason: 'CSRF_TOKEN_INVALID' } } })
  })
})

describe('GET /api/v1/customers/{id}（M-03）', () => {
  it('管理者は無効な顧客も含めて詳細を取得できる', async () => {
    const response = await getAs('admin', SEED_CUSTOMERS.old.id)

    expect(response.status).toBe(200)
    expect(dataResponseSchema(customerSchema).safeParse(response.body).success).toBe(true)
    expect((response.body as { data: Customer }).data).toMatchObject({
      id: SEED_CUSTOMERS.old.id,
      name: '旧取引先',
      is_active: false,
    })
  })

  it.each(['9999', 'abc', '0', '99999999999'])('存在しない・不正な ID（%s）は 404', async (id) => {
    const response = await getAs('admin', id)

    expect(response).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } })
  })

  it.each<SeedStaffKey>(['yamada', 'suzuki'])('管理者以外（%s）は 403', async (staff) => {
    const response = await getAs(staff, SEED_CUSTOMERS.abc.id)

    expect(response.status).toBe(403)
  })
})

describe('PUT /api/v1/customers/{id}（M-04）', () => {
  const UPDATE_INPUT = { ...FULL_INPUT, name: 'ABC商事（新）', is_active: true }

  it('管理者は全項目を更新できる', async () => {
    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, UPDATE_INPUT)

    expect(response.status).toBe(200)
    expect(dataResponseSchema(customerSchema).safeParse(response.body).success).toBe(true)
    expect((response.body as { data: Customer }).data).toMatchObject({
      id: SEED_CUSTOMERS.abc.id,
      name: 'ABC商事（新）',
      contact_person: '佐々木様',
      assigned_sales: { id: SEED_STAFF.sato.id, name: '佐藤花子' },
      is_active: true,
    })
  })

  it('無効にでき、過去の訪問記録は残る', async () => {
    const before = await prisma.visitRecord.count({ where: { customerId: SEED_CUSTOMERS.abc.id } })

    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, { name: 'ABC商事', is_active: false })

    expect((response.body as { data: Customer }).data.is_active).toBe(false)
    expect(await prisma.visitRecord.count({ where: { customerId: SEED_CUSTOMERS.abc.id } })).toBe(before)
  })

  it('省略した任意項目は未設定（null）になる', async () => {
    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, { name: 'ABC商事', is_active: true })

    expect((response.body as { data: Record<string, unknown> }).data).toMatchObject({
      contact_person: null,
      phone: null,
      address: null,
      assigned_sales: null,
    })
  })

  it('担当営業が今と同じなら、その営業が無効でも他の項目を更新できる', async () => {
    await prisma.customer.update({ where: { id: SEED_CUSTOMERS.abc.id }, data: { assignedSalesId: SEED_STAFF.retired.id } })

    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, {
      name: 'ABC商事',
      assigned_sales_id: SEED_STAFF.retired.id,
      is_active: true,
    })

    expect(response.status).toBe(200)
  })

  it('T-CUS-04: 担当営業を無効な営業に変えると 400 で、データは変わらない', async () => {
    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, {
      ...UPDATE_INPUT,
      assigned_sales_id: SEED_STAFF.retired.id,
    })

    expect(response).toMatchObject({ status: 400, body: { error: { details: [{ field: 'assigned_sales_id' }] } } })
    expect(await prisma.customer.findUnique({ where: { id: SEED_CUSTOMERS.abc.id } })).toMatchObject({
      name: 'ABC商事',
      assignedSalesId: SEED_STAFF.yamada.id,
    })
  })

  it('is_active がなければ 400', async () => {
    const response = await updateAs('admin', SEED_CUSTOMERS.abc.id, { name: 'ABC商事' })

    expect(response).toMatchObject({
      status: 400,
      body: { error: { details: [{ field: 'is_active', message: '状態は必須です' }] } },
    })
  })

  it('存在しない顧客は 404', async () => {
    const response = await updateAs('admin', 9999, UPDATE_INPUT)

    expect(response.status).toBe(404)
  })

  it.each<SeedStaffKey>(['yamada', 'suzuki'])('T-CUS-11: 管理者以外（%s）は更新できず 403', async (staff) => {
    const response = await updateAs(staff, SEED_CUSTOMERS.abc.id, UPDATE_INPUT)

    expect(response).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    expect(await prisma.customer.findUnique({ where: { id: SEED_CUSTOMERS.abc.id } })).toMatchObject({ name: 'ABC商事' })
  })
})
