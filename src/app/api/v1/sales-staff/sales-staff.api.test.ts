import { describe, expect, it } from 'vitest'

import { POST as login } from '@/app/api/v1/auth/login/route'
import { GET as me } from '@/app/api/v1/auth/me/route'
import { dataResponseSchema, listResponseSchema } from '@/schemas/response'
import { staffDetailSchema, staffSchema } from '@/schemas/sales-staff'
import { prisma } from '@/server/db/prisma'
import { SEED_PASSWORD, SEED_STAFF } from '@/server/db/seed/data'
import { STAFF_MESSAGES } from '@/server/services/sales-staff'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'

import { GET as getOne, PUT } from './[id]/route'
import { GET as list, POST } from './route'

type Staff = { id: number; name: string; email: string; role: string; is_active: boolean; manager: { id: number; name: string } | null }
type ListBody = { data: Staff[]; meta: { total_count: number } }
type ErrorBody = { error: { code: string; reason?: string; message: string; details?: { field: string; message: string }[] } }

const NEW_STAFF = {
  name: '木村健太',
  email: 'kimura@example.com',
  password: 'Kimura123',
  department: '営業1課',
  role: 'sales',
  manager_id: SEED_STAFF.suzuki.id,
}

/** 更新（S-04）のリクエスト。テストデータの営業の今の値をもとに、指定した項目だけ変える */
function updateBodyFor(staff: SeedStaffKey, changes: Record<string, unknown> = {}) {
  const current = SEED_STAFF[staff]
  return {
    name: current.name,
    email: current.email,
    department: current.department,
    role: current.role.toLowerCase(),
    manager_id: current.managerId,
    is_active: current.isActive,
    ...changes,
  }
}

async function listAs(staff: SeedStaffKey, query: Record<string, string | number | boolean | undefined> = {}) {
  const { headers } = await loginAs(staff)
  return callRoute<ListBody>(list, '/api/v1/sales-staff', { query, headers })
}

async function createAs(staff: SeedStaffKey, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<{ data: Staff } & ErrorBody>(POST, '/api/v1/sales-staff', { method: 'POST', body, headers })
}

async function getAs(staff: SeedStaffKey, id: string | number) {
  const { headers } = await loginAs(staff)
  return callRoute<{ data: Staff & { subordinate_count: number } }>(getOne, `/api/v1/sales-staff/${id}`, {
    params: { id: String(id) },
    headers,
  })
}

async function updateAs(staff: SeedStaffKey, id: number, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<{ data: Staff } & ErrorBody>(PUT, `/api/v1/sales-staff/${id}`, {
    method: 'PUT',
    params: { id: String(id) },
    body,
    headers,
  })
}

const loginWith = (email: string, password: string) =>
  callRoute(login, '/api/v1/auth/login', { method: 'POST', body: { email, password } })

const namesOf = (body: ListBody) => body.data.map((staff) => staff.name)

describe('GET /api/v1/sales-staff（S-01）', () => {
  it('管理者は有効な全員を、部署の昇順（部署なしは最後）→ 氏名の昇順で取得できる', async () => {
    const response = await listAs('admin')

    expect(response.status).toBe(200)
    expect(listResponseSchema(staffSchema).safeParse(response.body).success).toBe(true)
    expect(namesOf(response.body)).toEqual(['佐藤花子', '山田太郎', '鈴木一郎', '伊藤三郎', '田中次郎', '管理者'])
    expect(response.body.data.find((staff) => staff.id === SEED_STAFF.yamada.id)).toEqual({
      id: SEED_STAFF.yamada.id,
      name: '山田太郎',
      email: 'yamada@example.com',
      department: '営業1課',
      role: 'sales',
      manager: { id: SEED_STAFF.suzuki.id, name: '鈴木一郎' },
      is_active: true,
      created_at: expect.stringMatching(/\+09:00$/),
      updated_at: expect.stringMatching(/\+09:00$/),
    })
  })

  it('パスワードのハッシュはどの項目にも含まれない', async () => {
    const response = await listAs('admin')

    expect(JSON.stringify(response.body)).not.toMatch(/password|argon2/i)
  })

  it('include_inactive=true で無効な担当者も含める', async () => {
    const response = await listAs('admin', { include_inactive: true })

    expect(namesOf(response.body)).toContain('退職者')
    expect(response.body.meta.total_count).toBe(7)
  })

  it('氏名の部分一致・部署の完全一致・ロールで絞り込める', async () => {
    expect(namesOf((await listAs('admin', { name: '田' })).body)).toEqual(['山田太郎', '田中次郎'])
    expect(namesOf((await listAs('admin', { department: '営業2課' })).body)).toEqual(['伊藤三郎', '田中次郎'])
    expect(namesOf((await listAs('admin', { department: '営業' })).body)).toEqual([])
    expect(namesOf((await listAs('admin', { role: 'manager' })).body)).toEqual(['鈴木一郎', '田中次郎'])
  })

  it('ページングできる', async () => {
    const response = await listAs('admin', { page: 2, per_page: 4 })

    expect(namesOf(response.body)).toEqual(['田中次郎', '管理者'])
    expect(response.body.meta).toEqual({ page: 2, per_page: 4, total_count: 6, total_pages: 2 })
  })

  it('T-STF-10: 営業は 403', async () => {
    const response = await listAs('yamada')

    expect(response.status).toBe(403)
  })

  it('T-STF-11: 上長は自分と直属の部下だけ（鈴木・山田・佐藤）', async () => {
    const response = await listAs('suzuki')

    expect(response.status).toBe(200)
    expect(namesOf(response.body)).toEqual(['佐藤花子', '山田太郎', '鈴木一郎'])
  })

  it('上長が他チームの担当者を名前で探しても出てこない', async () => {
    const response = await listAs('suzuki', { name: '伊藤' })

    expect(namesOf(response.body)).toEqual([])
  })

  it('不正なクエリは 400', async () => {
    const response = await listAs('admin', { role: 'boss' })

    expect(response.status).toBe(400)
  })
})

describe('POST /api/v1/sales-staff（S-02）', () => {
  it('T-STF-01: 管理者は登録でき、レスポンスにパスワード系の項目が含まれない', async () => {
    const response = await createAs('admin', NEW_STAFF)

    expect(response.status).toBe(201)
    expect(dataResponseSchema(staffSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({
      name: '木村健太',
      email: 'kimura@example.com',
      role: 'sales',
      manager: { id: SEED_STAFF.suzuki.id, name: '鈴木一郎' },
      is_active: true,
    })
    expect(JSON.stringify(response.body)).not.toMatch(/password|argon2/i)
    expect(response.headers.get('location')).toBe(`/api/v1/sales-staff/${response.body.data.id}`)
  })

  it('パスワードは Argon2id でハッシュ化して保存し、登録したパスワードでログインできる', async () => {
    await createAs('admin', NEW_STAFF)

    const saved = await prisma.salesStaff.findUniqueOrThrow({ where: { email: 'kimura@example.com' } })
    expect(saved.passwordHash).toMatch(/^\$argon2id\$/)
    expect((await loginWith('kimura@example.com', 'Kimura123')).status).toBe(200)
  })

  it('メールアドレスは小文字にそろえて保存する', async () => {
    const response = await createAs('admin', { ...NEW_STAFF, email: 'Kimura@Example.com' })

    expect(response.body.data.email).toBe('kimura@example.com')
  })

  it('T-STF-02: 登録済みのメールアドレスなら 409 EMAIL_ALREADY_EXISTS（大文字・小文字の違いも重複とみなす）', async () => {
    for (const email of ['yamada@example.com', 'YAMADA@example.com']) {
      const response = await createAs('admin', { ...NEW_STAFF, email })

      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'CONFLICT', reason: 'EMAIL_ALREADY_EXISTS' })
    }
  })

  it('T-STF-03: パスワードポリシーを満たさなければ 400', async () => {
    for (const password of ['Pass0', 'password', '12345678']) {
      const response = await createAs('admin', { ...NEW_STAFF, password })

      expect(response.status).toBe(400)
      expect(response.body.error.details?.[0]?.field).toBe('password')
    }
  })

  it('T-STF-04: 上長に manager 以外・無効な上長・存在しない ID を指定すると 400', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.tanaka.id }, data: { isActive: false } })

    for (const managerId of [SEED_STAFF.yamada.id, SEED_STAFF.admin.id, SEED_STAFF.tanaka.id, 9999]) {
      const response = await createAs('admin', { ...NEW_STAFF, manager_id: managerId })

      expect(response.status).toBe(400)
      expect(response.body.error.details).toEqual([{ field: 'manager_id', message: STAFF_MESSAGES.invalidManager }])
    }
  })

  it('入力チェックのエラーは、項目名入りのメッセージで返す', async () => {
    const response = await createAs('admin', { ...NEW_STAFF, name: '', email: 'kimura' })

    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual([
      { field: 'name', message: '氏名は必須です' },
      { field: 'email', message: 'メールアドレスの形式が正しくありません' },
    ])
  })

  it('T-STF-13: 上長は登録できない（403）', async () => {
    expect((await createAs('suzuki', NEW_STAFF)).status).toBe(403)
  })

  it('営業も登録できない（403）', async () => {
    expect((await createAs('yamada', NEW_STAFF)).status).toBe(403)
  })
})

describe('GET /api/v1/sales-staff/{id}（S-03）', () => {
  it('T-STF-12: 部下の人数は有効な部下だけを数える（鈴木は 2 人。退職者は数えない）', async () => {
    const response = await getAs('admin', SEED_STAFF.suzuki.id)

    expect(response.status).toBe(200)
    expect(dataResponseSchema(staffDetailSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({ id: SEED_STAFF.suzuki.id, role: 'manager', subordinate_count: 2 })
  })

  it('部下がいなければ 0', async () => {
    expect((await getAs('admin', SEED_STAFF.yamada.id)).body.data.subordinate_count).toBe(0)
  })

  it('存在しない ID・ID として正しくない値は 404', async () => {
    expect((await getAs('admin', 9999)).status).toBe(404)
    expect((await getAs('admin', 'abc')).status).toBe(404)
  })

  it('管理者以外は 403（存在しない ID でも 403 にして、有無を推測させない）', async () => {
    expect((await getAs('suzuki', SEED_STAFF.yamada.id)).status).toBe(403)
    expect((await getAs('yamada', 9999)).status).toBe(403)
  })
})

describe('PUT /api/v1/sales-staff/{id}（S-04）', () => {
  it('管理者は全項目を更新できる', async () => {
    const response = await updateAs(
      'admin',
      SEED_STAFF.yamada.id,
      updateBodyFor('yamada', { name: '山田太郎（営業2課）', department: '営業2課', manager_id: SEED_STAFF.tanaka.id }),
    )

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      name: '山田太郎（営業2課）',
      department: '営業2課',
      manager: { id: SEED_STAFF.tanaka.id, name: '田中次郎' },
    })
  })

  it('T-STF-05: 自分自身を上長に指定すると 400', async () => {
    const response = await updateAs('admin', SEED_STAFF.suzuki.id, updateBodyFor('suzuki', { manager_id: SEED_STAFF.suzuki.id }))

    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual([{ field: 'manager_id', message: STAFF_MESSAGES.managerCycle }])
  })

  it('T-STF-06: 自分の部下（鈴木を上長にした新しい上長 X）を上長に指定すると 400', async () => {
    const x = await createAs('admin', { ...NEW_STAFF, name: '新上長X', email: 'x@example.com', role: 'manager' })
    expect(x.body.data.manager?.id).toBe(SEED_STAFF.suzuki.id)

    const response = await updateAs('admin', SEED_STAFF.suzuki.id, updateBodyFor('suzuki', { manager_id: x.body.data.id }))

    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual([{ field: 'manager_id', message: STAFF_MESSAGES.managerCycle }])
  })

  it('上長は有効な manager だけ（営業を指定すると 400）', async () => {
    const response = await updateAs('admin', SEED_STAFF.ito.id, updateBodyFor('ito', { manager_id: SEED_STAFF.yamada.id }))

    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual([{ field: 'manager_id', message: STAFF_MESSAGES.invalidManager }])
  })

  it('上長が今と同じなら、上長が無効になっていても他の項目を更新できる', async () => {
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.tanaka.id }, data: { isActive: false } })

    const response = await updateAs('admin', SEED_STAFF.ito.id, updateBodyFor('ito', { department: '営業3課' }))

    expect(response.status).toBe(200)
  })

  it('T-STF-07: パスワードを指定せずに更新しても、元のパスワードでログインできる', async () => {
    for (const password of [undefined, '']) {
      const response = await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { name: '山田太郎', password }))
      expect(response.status).toBe(200)
    }

    expect((await loginWith('yamada@example.com', SEED_PASSWORD)).status).toBe(200)
  })

  it('パスワードを指定すると変更され、新しいパスワードでログインできる', async () => {
    await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { password: 'NewPassw0rd' }))

    expect((await loginWith('yamada@example.com', 'NewPassw0rd')).status).toBe(200)
    expect((await loginWith('yamada@example.com', SEED_PASSWORD)).status).toBe(401)
  })

  it('T-STF-08: 部下がいる上長のロールを sales に変えると 409', async () => {
    const response = await updateAs('admin', SEED_STAFF.suzuki.id, updateBodyFor('suzuki', { role: 'sales' }))

    expect(response.status).toBe(409)
    expect(response.body.error).toEqual({ code: 'CONFLICT', message: STAFF_MESSAGES.hasSubordinates })
  })

  it('部下が無効な人だけなら、上長のロールを変えられる（決定事項 #31）', async () => {
    await prisma.salesStaff.updateMany({ where: { managerId: SEED_STAFF.suzuki.id }, data: { isActive: false } })

    const response = await updateAs('admin', SEED_STAFF.suzuki.id, updateBodyFor('suzuki', { role: 'sales' }))

    expect(response.status).toBe(200)
    expect(response.body.data.role).toBe('sales')
  })

  it('T-STF-09: 管理者は自分自身を無効にできない（400）', async () => {
    const response = await updateAs('admin', SEED_STAFF.admin.id, updateBodyFor('admin', { is_active: false }))

    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual([{ field: 'is_active', message: STAFF_MESSAGES.selfDeactivate }])
  })

  it('管理者は自分の権限を変えられない（400）が、他の項目は変えられる', async () => {
    const roleChange = await updateAs('admin', SEED_STAFF.admin.id, updateBodyFor('admin', { role: 'manager' }))
    expect(roleChange.status).toBe(400)
    expect(roleChange.body.error.details).toEqual([{ field: 'role', message: STAFF_MESSAGES.selfRoleChange }])

    const nameChange = await updateAs('admin', SEED_STAFF.admin.id, updateBodyFor('admin', { name: 'システム管理者' }))
    expect(nameChange.status).toBe(200)
  })

  it('他の人と同じメールアドレスに変えると 409、自分のメールアドレスの大文字・小文字を変えるだけなら更新できる', async () => {
    const duplicate = await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { email: 'sato@example.com' }))
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.reason).toBe('EMAIL_ALREADY_EXISTS')

    const same = await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { email: 'YAMADA@example.com' }))
    expect(same.status).toBe(200)
    expect(same.body.data.email).toBe('yamada@example.com')
  })

  it('T-AUTH-10: 無効にすると、その人のセッションがすべて削除され、ログイン中でも 401 になる', async () => {
    const yamada = await loginAs('yamada')
    const yamadaOnOtherDevice = await loginAs('yamada')

    const response = await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { is_active: false }))

    expect(response.status).toBe(200)
    expect(response.body.data.is_active).toBe(false)
    expect(await prisma.session.count({ where: { salesStaffId: SEED_STAFF.yamada.id } })).toBe(0)
    expect((await callRoute(me, '/api/v1/auth/me', { headers: yamada.headers })).status).toBe(401)
    expect((await callRoute(me, '/api/v1/auth/me', { headers: yamadaOnOtherDevice.headers })).status).toBe(401)
  })

  it('無効にしない更新では、セッションは残る', async () => {
    const yamada = await loginAs('yamada')

    await updateAs('admin', SEED_STAFF.yamada.id, updateBodyFor('yamada', { department: '営業2課' }))

    expect((await callRoute(me, '/api/v1/auth/me', { headers: yamada.headers })).status).toBe(200)
  })

  it('部下がいる上長も無効にできる（警告は画面で出す。M-11）', async () => {
    const response = await updateAs('admin', SEED_STAFF.suzuki.id, updateBodyFor('suzuki', { is_active: false }))

    expect(response.status).toBe(200)
  })

  it('存在しない ID は 404', async () => {
    expect((await updateAs('admin', 9999, updateBodyFor('yamada'))).status).toBe(404)
  })

  it('T-STF-13: 上長は更新できない（403）', async () => {
    expect((await updateAs('suzuki', SEED_STAFF.yamada.id, updateBodyFor('yamada'))).status).toBe(403)
  })
})
