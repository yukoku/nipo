import { hash } from '@node-rs/argon2'
import { describe, expect, it } from 'vitest'

import { hashPassword, needsRehash, verifyPassword } from '@/server/auth/password'

describe('hashPassword', () => {
  it('T-NF-04 の前提：平文ではなく、Argon2id（OWASP の推奨値）の PHC 形式の文字列にする', async () => {
    const passwordHash = await hashPassword('Passw0rd')

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(passwordHash).not.toContain('Passw0rd')
    // DB の password_hash は VARCHAR(255)
    expect(passwordHash.length).toBeLessThanOrEqual(255)
  })

  it('同じパスワードでも、ソルトが違うため毎回別のハッシュになる', async () => {
    expect(await hashPassword('Passw0rd')).not.toBe(await hashPassword('Passw0rd'))
  })
})

describe('verifyPassword', () => {
  it('正しいパスワードなら true、違えば false を返す', async () => {
    const passwordHash = await hashPassword('Passw0rd')

    expect(await verifyPassword(passwordHash, 'Passw0rd')).toBe(true)
    expect(await verifyPassword(passwordHash, 'passw0rd')).toBe(false)
    expect(await verifyPassword(passwordHash, '')).toBe(false)
  })

  it('日本語などの全角文字を含むパスワードも扱える', async () => {
    const passwordHash = await hashPassword('営業日報2026')
    expect(await verifyPassword(passwordHash, '営業日報2026')).toBe(true)
  })

  it('ハッシュが null（ユーザーがいない）なら、ダミーで計算してから false を返す', async () => {
    expect(await verifyPassword(null, 'Passw0rd')).toBe(false)
    // 2 回目以降は作成済みのダミーのハッシュを使う
    expect(await verifyPassword(null, 'dummy-password-for-timing')).toBe(false)
  })

  it('ハッシュの形式が壊れていても、例外にせず false を返す', async () => {
    expect(await verifyPassword('not-a-hash', 'Passw0rd')).toBe(false)
    expect(await verifyPassword('Passw0rd', 'Passw0rd')).toBe(false)
  })
})

describe('needsRehash', () => {
  it('今の設定で作ったハッシュは作り直さなくてよい', async () => {
    expect(needsRehash(await hashPassword('Passw0rd'))).toBe(false)
  })

  it('強さのパラメーターが違うハッシュは作り直す', async () => {
    expect(needsRehash(await hash('Passw0rd', { memoryCost: 4096, timeCost: 2, parallelism: 1 }))).toBe(true)
    expect(needsRehash(await hash('Passw0rd', { memoryCost: 19_456, timeCost: 3, parallelism: 1 }))).toBe(true)
    expect(needsRehash(await hash('Passw0rd', { memoryCost: 19_456, timeCost: 2, parallelism: 2 }))).toBe(true)
  })

  it('Argon2id 以外（Argon2i）や、壊れたハッシュは作り直す', async () => {
    // 1 = Algorithm.Argon2i（const enum のため数値で指定）
    expect(needsRehash(await hash('Passw0rd', { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 1 }))).toBe(
      true,
    )
    expect(needsRehash('not-a-hash')).toBe(true)
  })
})
