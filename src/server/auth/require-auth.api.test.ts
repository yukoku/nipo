import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { ok } from '@/server/api/response'
import { withApi } from '@/server/api/with-api'
import { createSession } from '@/server/auth/session'
import { SEED_STAFF } from '@/server/db/seed/data'
import { callRoute } from '@/test/api/route'

import { requireAuth } from './require-auth'

/** requireAuth() を使う、テスト用の Route Handler（ログイン中のユーザーの ID を返す） */
const handler = withApi(async (request) => {
  const { user } = await requireAuth(request)
  return ok({ id: user.id })
})

async function login(staffId: number = SEED_STAFF.yamada.id) {
  const { token, csrfToken } = await createSession(staffId)
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, csrfToken }
}

describe('requireAuth（テスト用DB のセッションで確認）', () => {
  it('T-AUTH-06: ログインしていなければ 401', async () => {
    const response = await callRoute(handler, '/api/v1/reports')

    expect(response).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } })
  })

  it('ログインしていなければ、更新系でも 403 より先に 401 を返す', async () => {
    const response = await callRoute(handler, '/api/v1/reports', { method: 'POST' })

    expect(response.status).toBe(401)
  })

  it('ログイン済みの GET は、CSRF トークンがなくても通る', async () => {
    const { cookie } = await login()

    const response = await callRoute(handler, '/api/v1/reports', { headers: { cookie } })

    expect(response).toMatchObject({ status: 200, body: { data: { id: SEED_STAFF.yamada.id } } })
  })

  it('T-AUTH-08: ログイン済みでも、X-CSRF-Token なしの POST は 403', async () => {
    const { cookie } = await login()

    const response = await callRoute(handler, '/api/v1/reports', { method: 'POST', headers: { cookie } })

    expect(response).toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN', reason: 'CSRF_TOKEN_INVALID' } },
    })
  })

  it.each(['POST', 'PUT', 'DELETE'])('%s で正しい X-CSRF-Token を付ければ通る', async (method) => {
    const { cookie, csrfToken } = await login()

    const response = await callRoute(handler, '/api/v1/reports/101', {
      method,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    })

    expect(response.status).toBe(200)
  })

  it('別のユーザーのセッションの CSRF トークンでは通らない', async () => {
    const yamada = await login(SEED_STAFF.yamada.id)
    const sato = await login(SEED_STAFF.sato.id)

    const response = await callRoute(handler, '/api/v1/reports', {
      method: 'POST',
      headers: { cookie: yamada.cookie, 'X-CSRF-Token': sato.csrfToken },
    })

    expect(response.status).toBe(403)
  })

  it('正しいトークンでも、別のサイトの Origin からの POST は 403', async () => {
    const { cookie, csrfToken } = await login()

    const response = await callRoute(handler, '/api/v1/reports', {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken, origin: 'https://evil.example.com' },
    })

    expect(response).toMatchObject({ status: 403, body: { error: { reason: 'CSRF_TOKEN_INVALID' } } })
  })

  it('同じサイトの Origin からの POST は通る', async () => {
    const { cookie, csrfToken } = await login()

    const response = await callRoute(handler, '/api/v1/reports', {
      method: 'POST',
      headers: { cookie, 'X-CSRF-Token': csrfToken, origin: 'http://localhost' },
    })

    expect(response.status).toBe(200)
  })
})
