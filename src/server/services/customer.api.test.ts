import { describe, expect, it } from 'vitest'

import { ForbiddenError } from '@/server/api/errors'
import { SEED_CUSTOMERS, SEED_STAFF } from '@/server/db/seed/data'

import { listCustomerOptions } from './customer'

const yamada = { id: SEED_STAFF.yamada.id, role: 'SALES' } as const
const suzuki = { id: SEED_STAFF.suzuki.id, role: 'MANAGER' } as const
const admin = { id: SEED_STAFF.admin.id, role: 'ADMIN' } as const

describe('listCustomerOptions（SC-03 の顧客セレクト）', () => {
  it('T-UI-22: 有効な顧客だけを顧客名の昇順で返す（無効な旧取引先は含まない）', async () => {
    const expected = [SEED_CUSTOMERS.abc, SEED_CUSTOMERS.def, SEED_CUSTOMERS.xyz].map(({ id, name }) => ({ id, name }))
    expect(await listCustomerOptions(yamada)).toEqual(expected)
    expect(await listCustomerOptions(suzuki)).toEqual(expected)
  })

  it('管理者は使えない（日報を書かないため）', async () => {
    await expect(listCustomerOptions(admin)).rejects.toThrow(ForbiddenError)
  })
})
