import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn', () => {
  it('クラス名を結合し、偽値は無視する', () => {
    const hidden = false
    expect(cn('px-2', hidden && 'hidden', undefined, 'py-1')).toBe('px-2 py-1')
  })

  it('Tailwind のクラスが競合したら後ろを優先する', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4')
  })
})
