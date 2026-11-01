import { describe, expect, it } from 'vitest'

import { buildPoolConfig, DEFAULT_POOL_MAX } from '@/server/db/pool-config'

const DATABASE_URL = 'postgresql://nipo:nipo@localhost:55432/nipo_dev'

describe('buildPoolConfig', () => {
  it('DATABASE_URL を接続文字列として使う', () => {
    expect(buildPoolConfig({ DATABASE_URL }).connectionString).toBe(DATABASE_URL)
  })

  it('DATABASE_URL が未設定・空なら、エラーになる', () => {
    expect(() => buildPoolConfig({})).toThrow('DATABASE_URL')
    expect(() => buildPoolConfig({ DATABASE_URL: '' })).toThrow('DATABASE_URL')
  })

  it('DATABASE_POOL_MAX が未設定・空白なら、接続数の上限は既定値の 10 になる', () => {
    expect(DEFAULT_POOL_MAX).toBe(10)
    expect(buildPoolConfig({ DATABASE_URL }).max).toBe(10)
    expect(buildPoolConfig({ DATABASE_URL, DATABASE_POOL_MAX: ' ' }).max).toBe(10)
  })

  it('DATABASE_POOL_MAX を指定すると、接続数の上限がその値になる', () => {
    expect(buildPoolConfig({ DATABASE_URL, DATABASE_POOL_MAX: '5' }).max).toBe(5)
    expect(buildPoolConfig({ DATABASE_URL, DATABASE_POOL_MAX: ' 1 ' }).max).toBe(1)
  })

  it.each(['0', '-1', '1.5', '10abc', 'abc', '99999999999999999999'])(
    'DATABASE_POOL_MAX が 1 以上の整数でない（%s）なら、エラーになる',
    (value) => {
      expect(() => buildPoolConfig({ DATABASE_URL, DATABASE_POOL_MAX: value })).toThrow('DATABASE_POOL_MAX')
    },
  )
})
