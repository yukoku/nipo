import { describe, expect, it } from 'vitest'

import { createErrorMap } from '@/lib/validation/error-map'

import {
  MANAGER_OF_MANAGER_MESSAGE,
  STAFF_FIELD_LABELS,
  staffCreateRequestSchema,
  staffListQuerySchema,
  staffUpdateRequestSchema,
} from './sales-staff'

const VALID = {
  name: '木村健太',
  email: 'kimura@example.com',
  password: 'Passw0rd',
  department: '営業1課',
  role: 'sales',
  manager_id: 1,
}

function errors(schema: typeof staffCreateRequestSchema | typeof staffUpdateRequestSchema, input: unknown) {
  const result = schema.safeParse(input, { error: createErrorMap(STAFF_FIELD_LABELS) })
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('staffCreateRequestSchema（S-02）', () => {
  it('全項目が正しければ通り、メールアドレスは小文字にそろえる', () => {
    expect(staffCreateRequestSchema.parse({ ...VALID, email: ' Kimura@Example.COM ' })).toEqual({ ...VALID, email: 'kimura@example.com' })
  })

  it('任意項目（部署・上長）は省略・空文字・null を null にする', () => {
    const parsed = staffCreateRequestSchema.parse({ ...VALID, department: '  ', manager_id: undefined })

    expect(parsed.department).toBeNull()
    expect(parsed.manager_id).toBeNull()
    expect(staffCreateRequestSchema.parse({ ...VALID, manager_id: null }).manager_id).toBeNull()
  })

  it('必須項目が空なら、項目名入りの必須エラー（M-02）', () => {
    expect(errors(staffCreateRequestSchema, { ...VALID, name: ' ', email: '', password: undefined, role: undefined })).toEqual({
      name: '氏名は必須です',
      email: 'メールアドレスは必須です',
      password: 'パスワードは必須です',
      role: '権限は必須です',
    })
  })

  it('文字数の上限（氏名 50・メールアドレス 255・部署 50）', () => {
    expect(errors(staffCreateRequestSchema, { ...VALID, name: 'あ'.repeat(50), department: 'あ'.repeat(50) })).toEqual({})
    expect(
      errors(staffCreateRequestSchema, {
        ...VALID,
        name: 'あ'.repeat(51),
        email: `${'a'.repeat(244)}@example.com`,
        department: 'あ'.repeat(51),
      }),
    ).toEqual({
      name: '氏名は50文字以内で入力してください',
      email: 'メールアドレスは255文字以内で入力してください',
      department: '部署は50文字以内で入力してください',
    })
  })

  it('メール形式・権限の値・上長の ID が正しくなければエラー', () => {
    expect(Object.keys(errors(staffCreateRequestSchema, { ...VALID, email: 'kimura', role: 'boss', manager_id: 0 }))).toEqual([
      'email',
      'role',
      'manager_id',
    ])
  })

  it('T-STF-03: パスワードポリシー（8 文字以上・英字と数字を含む）', () => {
    for (const password of ['Pass0', 'password', '12345678']) {
      expect(errors(staffCreateRequestSchema, { ...VALID, password })).toHaveProperty('password')
    }
    expect(errors(staffCreateRequestSchema, { ...VALID, password: 'Passw0rd' })).toEqual({})
  })
})

describe('権限が「上長」の人の上長（決定事項 #35）', () => {
  it.each([
    ['staffCreateRequestSchema（S-02）', staffCreateRequestSchema, VALID],
    ['staffUpdateRequestSchema（S-04）', staffUpdateRequestSchema, { ...VALID, is_active: true }],
  ] as const)('%s：権限が manager なら上長は null だけ。指定するとエラー', (_name, schema, base) => {
    expect(errors(schema, { ...base, role: 'manager', manager_id: 1 })).toEqual({ manager_id: MANAGER_OF_MANAGER_MESSAGE })
    expect(schema.parse({ ...base, role: 'manager', manager_id: null }).manager_id).toBeNull()
    expect(schema.parse({ ...base, role: 'manager', manager_id: undefined }).manager_id).toBeNull()
  })

  it('営業・管理者には上長を設定できる', () => {
    expect(staffCreateRequestSchema.parse({ ...VALID, role: 'sales' }).manager_id).toBe(1)
    expect(staffCreateRequestSchema.parse({ ...VALID, role: 'admin' }).manager_id).toBe(1)
  })

  it('他の項目にエラーがあっても、上長のエラーも一緒に出す', () => {
    expect(errors(staffCreateRequestSchema, { ...VALID, name: '', role: 'manager' })).toEqual({
      name: '氏名は必須です',
      manager_id: MANAGER_OF_MANAGER_MESSAGE,
    })
  })
})

describe('staffUpdateRequestSchema（S-04）', () => {
  const UPDATE = { ...VALID, is_active: true }

  it('パスワードは省略・空文字・null なら変更しない（undefined になる）', () => {
    for (const password of [undefined, '', null]) {
      expect(staffUpdateRequestSchema.parse({ ...UPDATE, password }).password).toBeUndefined()
    }
  })

  it('パスワードを指定したら、ポリシーを確かめる', () => {
    expect(staffUpdateRequestSchema.parse({ ...UPDATE, password: 'NewPassw0rd' }).password).toBe('NewPassw0rd')
    expect(errors(staffUpdateRequestSchema, { ...UPDATE, password: 'short1' })).toHaveProperty('password')
  })

  it('is_active は必須', () => {
    expect(errors(staffUpdateRequestSchema, { ...VALID })).toEqual({ is_active: '状態は必須です' })
  })
})

describe('staffListQuerySchema（S-01）', () => {
  it('空の値は指定なしとして扱い、include_inactive の既定は false', () => {
    expect(staffListQuerySchema.parse({ name: '', department: '', role: '', include_inactive: '' })).toEqual({
      page: 1,
      per_page: 20,
      include_inactive: false,
    })
  })

  it('各条件を受け取る', () => {
    expect(
      staffListQuerySchema.parse({ name: ' 山田 ', department: '営業1課', role: 'manager', include_inactive: 'true', page: '2' }),
    ).toEqual({ name: '山田', department: '営業1課', role: 'manager', include_inactive: true, page: 2, per_page: 20 })
  })

  it('不正なロール・include_inactive はエラー', () => {
    expect(staffListQuerySchema.safeParse({ role: 'boss' }).success).toBe(false)
    expect(staffListQuerySchema.safeParse({ include_inactive: 'yes' }).success).toBe(false)
  })
})
