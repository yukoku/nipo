import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { ForbiddenError } from '@/server/api/errors'

import { isUnsafeMethod, verifyCsrf, verifyOrigin } from './csrf'

const TOKEN = 'csrf-token-of-session'

function request(method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://nipo.example.com/api/v1/reports', {
    method,
    headers: { host: 'nipo.example.com', ...headers },
  })
}

/** 投げられた例外を返す（投げられなければ undefined） */
function thrown(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('isUnsafeMethod', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('%s は更新系', (method) => {
    expect(isUnsafeMethod(method)).toBe(true)
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s は更新系ではない', (method) => {
    expect(isUnsafeMethod(method)).toBe(false)
  })
})

describe('verifyCsrf', () => {
  it('GET はヘッダーがなくても通す（読み取りは CSRF の対象外）', () => {
    expect(() => verifyCsrf(request('GET'), TOKEN)).not.toThrow()
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s で正しいトークンなら通す', (method) => {
    expect(() => verifyCsrf(request(method, { 'X-CSRF-Token': TOKEN }), TOKEN)).not.toThrow()
  })

  it.each([
    ['ヘッダーがない', {}],
    ['空文字', { 'X-CSRF-Token': '' }],
    ['値が違う', { 'X-CSRF-Token': 'wrong-token' }],
    ['先頭に余計な文字がある', { 'X-CSRF-Token': `x${TOKEN}` }],
  ])('トークンが%s場合は 403（reason: CSRF_TOKEN_INVALID）', (_label, headers) => {
    const error = thrown(() => verifyCsrf(request('POST', headers), TOKEN))

    expect(error).toBeInstanceOf(ForbiddenError)
    expect((error as ForbiddenError).toBody()).toEqual({
      error: { code: 'FORBIDDEN', reason: 'CSRF_TOKEN_INVALID', message: expect.any(String) },
    })
  })

  it('セッション側のトークンが空なら、どんな値も通さない', () => {
    expect(() => verifyCsrf(request('POST', { 'X-CSRF-Token': '' }), '')).toThrow(ForbiddenError)
  })

  it('トークンが正しくても、別のサイトの Origin なら 403', () => {
    const headers = { 'X-CSRF-Token': TOKEN, origin: 'https://evil.example.com' }

    expect(() => verifyCsrf(request('POST', headers), TOKEN)).toThrow(ForbiddenError)
  })
})

describe('verifyOrigin', () => {
  it('Origin がなければ通す（CSRF トークンの確認で防ぐ）', () => {
    expect(() => verifyOrigin(request('POST'))).not.toThrow()
  })

  it('同じホストなら、スキームが違っても通す（Cloud Run では TLS が手前で終わるため）', () => {
    expect(() => verifyOrigin(request('POST', { origin: 'https://nipo.example.com' }))).not.toThrow()
    expect(() => verifyOrigin(request('POST', { origin: 'http://NIPO.example.com' }))).not.toThrow()
  })

  it('X-Forwarded-Host があれば、そのホストと比べる', () => {
    const headers = { host: 'internal:8080', 'x-forwarded-host': 'nipo.example.com', origin: 'https://nipo.example.com' }

    expect(() => verifyOrigin(request('POST', headers))).not.toThrow()
  })

  it.each([
    ['別のサイト', 'https://evil.example.com'],
    ['ポートが違う', 'https://nipo.example.com:8443'],
    ['サブドメインが違う', 'https://sub.nipo.example.com'],
    ['null（サンドボックスの iframe など）', 'null'],
  ])('%s の Origin は 403', (_label, origin) => {
    expect(() => verifyOrigin(request('POST', { origin }))).toThrow(ForbiddenError)
  })
})
