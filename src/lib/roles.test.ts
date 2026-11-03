import { describe, expect, it } from 'vitest'

import { ROLE_LABELS, fromApiRole } from './roles'

describe('fromApiRole', () => {
  it('API のロールを DB のロールにする', () => {
    expect(fromApiRole('sales')).toBe('SALES')
    expect(fromApiRole('manager')).toBe('MANAGER')
    expect(fromApiRole('admin')).toBe('ADMIN')
  })
})

describe('ROLE_LABELS', () => {
  it('ロールの表示名を返す', () => {
    expect(ROLE_LABELS).toEqual({ sales: '営業', manager: '上長', admin: '管理者' })
  })
})
