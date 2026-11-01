import { describe, expect, it, vi } from 'vitest'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'

import { clearSessionCookie, hashToken, sessionCookieOptions, setSessionCookie } from './session'

const EXPIRES_AT = new Date('2026-11-07T10:00:00+09:00')

describe('sessionCookieOptions（T-NF-05）', () => {
  it('本番では HttpOnly・Secure・SameSite=Lax・Path=/ を付ける', () => {
    expect(sessionCookieOptions(EXPIRES_AT, { NODE_ENV: 'production' })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: EXPIRES_AT,
    })
  })

  it.each(['development', 'test'] as const)('%s では Secure を付けない（http://localhost でも動くように）', (env) => {
    expect(sessionCookieOptions(EXPIRES_AT, { NODE_ENV: env })).toMatchObject({ httpOnly: true, secure: false })
  })
})

describe('setSessionCookie・clearSessionCookie', () => {
  it('セッション Cookie を、DB の有効期限と同じ有効期限で設定する', () => {
    const target = { set: vi.fn() }

    setSessionCookie(target, 'token', EXPIRES_AT)

    expect(target.set).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'token', expect.objectContaining({ expires: EXPIRES_AT }))
  })

  it('消すときは、空の値と過去の有効期限で上書きする', () => {
    const target = { set: vi.fn() }

    clearSessionCookie(target)

    expect(target.set).toHaveBeenCalledWith(SESSION_COOKIE_NAME, '', expect.objectContaining({ expires: new Date(0) }))
  })
})

describe('hashToken', () => {
  it('SHA-256 の 16 進数 64 文字にする（同じトークンからは同じ値）', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abd')).not.toBe(hashToken('abc'))
  })
})
