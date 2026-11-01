import { hash } from '@node-rs/argon2'
import { describe, expect, it, vi } from 'vitest'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { currentUserSchema } from '@/schemas/auth'
import { dataResponseSchema } from '@/schemas/response'
import * as password from '@/server/auth/password'
import { SESSION_TTL_MS, createSession, hashToken } from '@/server/auth/session'
import { prisma } from '@/server/db/prisma'
import { SEED_PASSWORD, SEED_STAFF } from '@/server/db/seed/data'
import { loginAs } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'

import { POST as login } from './login/route'
import { POST as logout } from './logout/route'
import { GET as me } from './me/route'

vi.mock('@/server/auth/password', async (importOriginal) => {
  const actual = await importOriginal<typeof password>()
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) }
})

const LOGIN_FAILED = {
  error: { code: 'UNAUTHENTICATED', message: 'メールアドレスまたはパスワードが正しくありません' },
}

const postLogin = (body: unknown, headers: Record<string, string> = {}) =>
  callRoute(login, '/api/v1/auth/login', { method: 'POST', body, headers })

/** Set-Cookie ヘッダーからセッション Cookie の値を取り出す */
function sessionCookieFrom(headers: Headers): string | undefined {
  const cookie = headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))
  return cookie?.split(';')[0]?.slice(SESSION_COOKIE_NAME.length + 1)
}

describe('POST /api/v1/auth/login（A-01）', () => {
  it('T-AUTH-01: ログインに成功すると 200・ユーザー情報・csrf_token を返し、セッション Cookie を発行する', async () => {
    const response = await postLogin({ email: 'yamada@example.com', password: SEED_PASSWORD })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: {
        id: SEED_STAFF.yamada.id,
        name: '山田太郎',
        email: 'yamada@example.com',
        department: '営業1課',
        role: 'sales',
        manager: { id: SEED_STAFF.suzuki.id, name: '鈴木一郎' },
        subordinates: [],
        csrf_token: expect.stringMatching(/^[\w-]{43}$/),
      },
    })
    // OpenAPI に登録したレスポンスのスキーマと一致する
    expect(dataResponseSchema(currentUserSchema).safeParse(response.body).success).toBe(true)

    const setCookie = response.headers.getSetCookie().join('\n')
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=[\\w-]{43};`))
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).toMatch(/Path=\//)

    // 発行した Cookie のトークンのハッシュが DB に保存されている
    const token = sessionCookieFrom(response.headers)!
    expect(await prisma.session.count({ where: { tokenHash: hashToken(token), salesStaffId: SEED_STAFF.yamada.id } })).toBe(1)
  })

  it('メールアドレスの大文字・小文字は区別しない', async () => {
    const response = await postLogin({ email: 'YAMADA@Example.com', password: SEED_PASSWORD })

    expect(response.status).toBe(200)
  })

  it('T-AUTH-02: パスワードが違えば 401', async () => {
    const response = await postLogin({ email: 'yamada@example.com', password: 'Wrong0pass' })

    expect(response).toMatchObject({ status: 401, body: LOGIN_FAILED })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('T-AUTH-03: 存在しないメールアドレスは、T-AUTH-02 と同じ 401', async () => {
    const response = await postLogin({ email: 'unknown@example.com', password: SEED_PASSWORD })

    expect(response).toMatchObject({ status: 401, body: LOGIN_FAILED })
  })

  it('T-AUTH-04: 無効なアカウントは、正しいパスワードでも T-AUTH-02 と同じ 401', async () => {
    const response = await postLogin({ email: 'retired@example.com', password: SEED_PASSWORD })

    expect(response).toMatchObject({ status: 401, body: LOGIN_FAILED })
    expect(await prisma.session.count()).toBe(0)
  })

  it('存在しない・無効なアカウントでも、パスワードの照合（ハッシュ計算）を同じように行う（応答時間で推測させない）', async () => {
    vi.mocked(password.verifyPassword).mockClear()

    await postLogin({ email: 'unknown@example.com', password: 'x' })
    await postLogin({ email: 'retired@example.com', password: 'x' })
    await postLogin({ email: 'yamada@example.com', password: 'x' })

    expect(vi.mocked(password.verifyPassword).mock.calls.map(([passwordHash]) => passwordHash === null)).toEqual([
      true, // 存在しない → ダミーのハッシュで照合
      true, // 無効 → ダミーのハッシュで照合
      false, // 有効 → 本物のハッシュで照合
    ])
  })

  it('T-AUTH-05: メールアドレス・パスワードが空なら 400 と各項目の必須エラー', async () => {
    const response = await postLogin({ email: '', password: '' })

    expect(response).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'email', message: 'メールアドレスは必須です' },
            { field: 'password', message: 'パスワードは必須です' },
          ],
        },
      },
    })
  })

  it('別のサイトの Origin からのログインは 403', async () => {
    const response = await postLogin(
      { email: 'yamada@example.com', password: SEED_PASSWORD },
      { origin: 'https://evil.example.com' },
    )

    expect(response).toMatchObject({ status: 403, body: { error: { reason: 'CSRF_TOKEN_INVALID' } } })
  })

  it('ハッシュのパラメーターが古ければ、ログイン成功時に今の設定で作り直す', async () => {
    const oldHash = await hash(SEED_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 })
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.yamada.id }, data: { passwordHash: oldHash } })

    expect((await postLogin({ email: 'yamada@example.com', password: SEED_PASSWORD })).status).toBe(200)

    const { passwordHash } = await prisma.salesStaff.findUniqueOrThrow({ where: { id: SEED_STAFF.yamada.id } })
    expect(passwordHash).not.toBe(oldHash)
    expect(password.needsRehash(passwordHash)).toBe(false)
  })
})

describe('GET /api/v1/auth/me（A-03）', () => {
  it('ログイン中のユーザーの情報と csrf_token を返す', async () => {
    const yamada = await loginAs('yamada')

    const response = await callRoute(me, '/api/v1/auth/me', { headers: { cookie: yamada.headers.cookie } })

    expect(response).toMatchObject({
      status: 200,
      body: { data: { id: SEED_STAFF.yamada.id, role: 'sales', csrf_token: yamada.csrfToken } },
    })
  })

  it('T-AUTH-06: ログインしていなければ 401', async () => {
    const response = await callRoute(me, '/api/v1/auth/me')

    expect(response).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } })
  })

  it('T-AUTH-09: 上長には、有効な直属の部下（山田・佐藤）だけを返す（退職者は含まない）', async () => {
    const suzuki = await loginAs('suzuki')

    const response = await callRoute(me, '/api/v1/auth/me', { headers: suzuki.headers })

    expect(response.body).toMatchObject({
      data: {
        role: 'manager',
        manager: null,
        subordinates: [
          { id: SEED_STAFF.yamada.id, name: '山田太郎' },
          { id: SEED_STAFF.sato.id, name: '佐藤花子' },
        ],
      },
    })
  })

  it('DB の有効期限を延ばしたときは、Cookie の有効期限も延ばす', async () => {
    // 2 時間前にログインしたセッション（延長の対象）
    const { token } = await createSession(SEED_STAFF.yamada.id, new Date(Date.now() - 2 * 60 * 60 * 1000))

    const response = await callRoute(me, '/api/v1/auth/me', { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })

    const setCookie = response.headers.getSetCookie().join('\n')
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=${token}`)
    const expires = new Date(/Expires=([^;]+)/i.exec(setCookie)![1]!)
    expect(expires.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000)
  })

  it('延ばす必要がなければ、Cookie を送り直さない', async () => {
    const yamada = await loginAs('yamada')

    const response = await callRoute(me, '/api/v1/auth/me', { headers: yamada.headers })

    expect(response.headers.getSetCookie()).toEqual([])
  })
})

describe('POST /api/v1/auth/logout（A-02）', () => {
  it('T-AUTH-07: ログアウトすると 204 でセッション Cookie を消し、その後の /auth/me は 401', async () => {
    const yamada = await loginAs('yamada')

    const response = await callRoute(logout, '/api/v1/auth/logout', { method: 'POST', headers: yamada.headers })

    expect(response).toMatchObject({ status: 204, body: null })
    expect(response.headers.getSetCookie().join('\n')).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;.*Expires=Thu, 01 Jan 1970`, 'i'))
    expect(await prisma.session.count({ where: { tokenHash: hashToken(yamada.token) } })).toBe(0)

    const after = await callRoute(me, '/api/v1/auth/me', { headers: yamada.headers })
    expect(after.status).toBe(401)
  })

  it('別の端末のセッションはログアウトしない', async () => {
    const pc = await loginAs('yamada')
    const phone = await loginAs('yamada')

    await callRoute(logout, '/api/v1/auth/logout', { method: 'POST', headers: pc.headers })

    expect((await callRoute(me, '/api/v1/auth/me', { headers: phone.headers })).status).toBe(200)
  })

  it('T-AUTH-08: ログイン済みでも X-CSRF-Token なしの POST は 403（ログアウトされない）', async () => {
    const yamada = await loginAs('yamada')

    const response = await callRoute(logout, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: yamada.headers.cookie },
    })

    expect(response).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN', reason: 'CSRF_TOKEN_INVALID' } } })
    expect((await callRoute(me, '/api/v1/auth/me', { headers: yamada.headers })).status).toBe(200)
  })

  it('ログインしていなければ 401', async () => {
    const response = await callRoute(logout, '/api/v1/auth/logout', { method: 'POST' })

    expect(response.status).toBe(401)
  })
})

describe('ログイン → /auth/me → ログアウトの一連の流れ', () => {
  it('ログインで受け取った Cookie と csrf_token で、そのまま他の API を呼べる', async () => {
    const loggedIn = await postLogin({ email: 'suzuki@example.com', password: SEED_PASSWORD })
    const cookie = `${SESSION_COOKIE_NAME}=${sessionCookieFrom(loggedIn.headers)}`
    const csrfToken = (loggedIn.body as { data: { csrf_token: string } }).data.csrf_token

    expect((await callRoute(me, '/api/v1/auth/me', { headers: { cookie } })).body).toMatchObject({
      data: { id: SEED_STAFF.suzuki.id, csrf_token: csrfToken },
    })
    expect(
      (await callRoute(logout, '/api/v1/auth/logout', { method: 'POST', headers: { cookie, 'X-CSRF-Token': csrfToken } }))
        .status,
    ).toBe(204)
    expect((await callRoute(me, '/api/v1/auth/me', { headers: { cookie } })).status).toBe(401)
  })
})
