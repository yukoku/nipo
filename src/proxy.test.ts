import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { REQUEST_PATH_HEADER } from '@/lib/routes'
import { SESSION_TTL_MS } from '@/server/auth/session-cookie'
import { setupFixedTime } from '@/test/time'

import { config, proxy } from './proxy'

const ORIGIN = 'http://localhost:3000'

function request(path: string, token?: string): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, { headers: { [REQUEST_PATH_HEADER]: '/forged' } })
  if (token !== undefined) {
    req.cookies.set(SESSION_COOKIE_NAME, token)
  }
  return req
}

describe('proxy の対象パス（matcher）', () => {
  it.each(['/', '/reports', '/reports/101', '/customers', '/login'])('画面 %s では動く', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true)
  })

  it.each(['/api/v1/auth/me', '/api', '/_next/static/chunks/main.js', '/_next/image', '/dev/ui-sample', '/favicon.ico', '/robots.txt'])(
    'API・静的ファイル・開発用の画面 %s では動かない',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(false)
    },
  )
})

describe('proxy', () => {
  setupFixedTime()

  it('T-UI-02: セッション Cookie がなければ、ログイン画面へ戻り先付きでリダイレクトする', () => {
    const response = proxy(request('/reports/101?from=list'))

    expect(response.status).toBe(307)
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?next=%2Freports%2F101%3Ffrom%3Dlist`)
  })

  it('トップ画面からのリダイレクトには next を付けない', () => {
    expect(getRedirectUrl(proxy(request('/')))).toBe(`${ORIGIN}/login`)
  })

  it('Cookie の値が空でもログイン画面へリダイレクトする', () => {
    expect(getRedirectUrl(proxy(request('/reports', '')))).toBe(`${ORIGIN}/login?next=%2Freports`)
  })

  it('ログイン画面は Cookie がなくても開ける', () => {
    const response = proxy(request('/login?next=/reports'))

    expect(getRedirectUrl(response)).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('Cookie があれば通し、Cookie の有効期限を今から 7 日に延ばす（決定事項 #28）', () => {
    const response = proxy(request('/reports', 'token-value'))
    const cookie = response.cookies.get(SESSION_COOKIE_NAME)

    expect(getRedirectUrl(response)).toBeNull()
    expect(cookie).toMatchObject({ value: 'token-value', httpOnly: true, sameSite: 'lax', path: '/' })
    expect(cookie?.expires).toEqual(new Date(Date.now() + SESSION_TTL_MS))
  })

  it('表示する画面のパスを、ブラウザから送られた値を上書きしてヘッダーで画面に伝える', () => {
    const response = proxy(request('/reports?page=2', 'token-value'))

    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe('/reports?page=2')
  })
})
