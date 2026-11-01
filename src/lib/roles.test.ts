import { describe, expect, it } from 'vitest'

import { fromApiRole } from './roles'

describe('fromApiRole', () => {
  it('API のロールを DB のロールにする', () => {
    expect(fromApiRole('sales')).toBe('SALES')
    expect(fromApiRole('manager')).toBe('MANAGER')
    expect(fromApiRole('admin')).toBe('ADMIN')
  })
})
