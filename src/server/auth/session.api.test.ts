import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { UnauthenticatedError } from '@/server/api/errors'
import { prisma } from '@/server/db/prisma'
import { SEED_STAFF } from '@/server/db/seed/data'

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value === undefined ? undefined : { value: cookieStore.value }) }),
}))

const {
  SESSION_RENEW_INTERVAL_MS,
  SESSION_TTL_MS,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForStaff,
  getCurrentSession,
  getCurrentUser,
  hashToken,
  requireCurrentUser,
  validateSessionToken,
} = await import('./session')

const NOW = new Date('2026-10-31T10:00:00+09:00')
const after = (ms: number) => new Date(NOW.getTime() + ms)
const HOUR = 60 * 60 * 1000

/** セッション Cookie 付きのリクエスト */
function requestWithCookie(token?: string): NextRequest {
  const headers = token === undefined ? undefined : { cookie: `${SESSION_COOKIE_NAME}=${token}` }
  return new NextRequest('http://localhost/api/v1/auth/me', { headers })
}

describe('createSession', () => {
  it('推測できないトークンと CSRF トークンを作り、有効期限は 7 日後', async () => {
    const created = await createSession(SEED_STAFF.yamada.id, NOW)

    expect(created.token).toMatch(/^[\w-]{43}$/) // 256 ビットの base64url
    expect(created.csrfToken).toMatch(/^[\w-]{43}$/)
    expect(created.csrfToken).not.toBe(created.token)
    expect(created.expiresAt).toEqual(after(SESSION_TTL_MS))
  })

  it('sessions テーブルに生のトークンを保存せず、SHA-256 だけを保存する', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id, NOW)

    const rows = await prisma.$queryRaw<{ token_hash: string }[]>`SELECT token_hash FROM sessions`
    expect(rows).toEqual([{ token_hash: hashToken(token) }])
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    // どの列にも生のトークンが入っていない
    const raw = await prisma.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM sessions s WHERE row_to_json(s)::text LIKE ${`%${token}%`}) AS found`
    expect(raw).toEqual([{ found: false }])
  })

  it('同じ営業が複数の端末でログインしても、それぞれ別のセッションになる', async () => {
    const pc = await createSession(SEED_STAFF.yamada.id, NOW)
    const phone = await createSession(SEED_STAFF.yamada.id, NOW)

    expect(pc.token).not.toBe(phone.token)
    expect(await prisma.session.count({ where: { salesStaffId: SEED_STAFF.yamada.id } })).toBe(2)
  })

  it('作成のついでに、全ユーザーの期限切れのセッションを削除する', async () => {
    await createSession(SEED_STAFF.sato.id, NOW) // 7 日後に期限切れ
    await createSession(SEED_STAFF.suzuki.id, after(SESSION_TTL_MS - HOUR)) // まだ有効

    await createSession(SEED_STAFF.yamada.id, after(SESSION_TTL_MS))

    const remaining = await prisma.session.findMany({ select: { salesStaffId: true }, orderBy: { id: 'asc' } })
    expect(remaining.map((s) => s.salesStaffId)).toEqual([SEED_STAFF.suzuki.id, SEED_STAFF.yamada.id])
  })
})

describe('validateSessionToken', () => {
  it('有効なトークンなら、ユーザーとセッションを返す（パスワードのハッシュなどは含まない）', async () => {
    const created = await createSession(SEED_STAFF.yamada.id, NOW)

    const result = await validateSessionToken(created.token, after(HOUR / 2))

    expect(result).toEqual({
      user: {
        id: SEED_STAFF.yamada.id,
        name: SEED_STAFF.yamada.name,
        email: SEED_STAFF.yamada.email,
        role: 'SALES',
        department: SEED_STAFF.yamada.department,
        managerId: SEED_STAFF.suzuki.id,
      },
      session: { id: expect.any(Number), csrfToken: created.csrfToken, expiresAt: created.expiresAt, renewed: false },
    })
  })

  it.each([
    ['存在しない', 'unknown-token'],
    ['空文字の', ''],
    ['極端に長い', 'a'.repeat(129)],
  ])('%sトークンでは認証しない', async (_label, token) => {
    await createSession(SEED_STAFF.yamada.id, NOW)

    expect(await validateSessionToken(token, NOW)).toBeNull()
  })

  it('トークンがない（undefined）なら認証しない', async () => {
    expect(await validateSessionToken(undefined, NOW)).toBeNull()
  })

  it('期限切れのセッションでは認証せず、そのセッションを削除する', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id, NOW)

    expect(await validateSessionToken(token, after(SESSION_TTL_MS - 1))).not.toBeNull()
    expect(await validateSessionToken(token, after(2 * SESSION_TTL_MS))).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })

  it('無効化された営業のセッションでは認証せず、そのセッションを削除する', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id, NOW)
    await prisma.salesStaff.update({ where: { id: SEED_STAFF.yamada.id }, data: { isActive: false } })

    expect(await validateSessionToken(token, after(HOUR))).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })

  describe('有効期限の延長（最後のアクセスから 7 日）', () => {
    it('前回の延長から 1 時間たっていなければ、DB に書き込まない', async () => {
      const created = await createSession(SEED_STAFF.yamada.id, NOW)

      const result = await validateSessionToken(created.token, after(SESSION_RENEW_INTERVAL_MS - 1))

      expect(result?.session).toMatchObject({ renewed: false, expiresAt: created.expiresAt })
    })

    it('1 時間以上たっていれば、有効期限を「今から 7 日後」に延ばして DB に保存する', async () => {
      const { token } = await createSession(SEED_STAFF.yamada.id, NOW)
      const accessedAt = after(3 * 24 * HOUR)

      const result = await validateSessionToken(token, accessedAt)

      const expected = new Date(accessedAt.getTime() + SESSION_TTL_MS)
      expect(result?.session).toMatchObject({ renewed: true, expiresAt: expected })
      expect((await prisma.session.findFirstOrThrow()).expiresAt).toEqual(expected)
    })

    it('使い続けていれば、最初のログインから 7 日を過ぎても認証できる', async () => {
      const { token } = await createSession(SEED_STAFF.yamada.id, NOW)

      expect(await validateSessionToken(token, after(6 * 24 * HOUR))).not.toBeNull()
      expect(await validateSessionToken(token, after(12 * 24 * HOUR))).not.toBeNull()
    })
  })

  it('DB の接続を切ってつなぎ直しても（サーバーの再起動に相当）、ログイン状態が保たれる', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id, NOW)

    await prisma.$disconnect()

    expect((await validateSessionToken(token, after(HOUR / 2)))?.user.id).toBe(SEED_STAFF.yamada.id)
  })
})

describe('セッションの削除', () => {
  it('deleteSession：そのセッションだけを削除する（ログアウト）', async () => {
    const pc = await createSession(SEED_STAFF.yamada.id, NOW)
    const phone = await createSession(SEED_STAFF.yamada.id, NOW)

    await deleteSession(pc.token)

    expect(await validateSessionToken(pc.token, NOW)).toBeNull()
    expect(await validateSessionToken(phone.token, NOW)).not.toBeNull()
  })

  it('deleteSession：存在しないトークン・空の値でもエラーにしない', async () => {
    await expect(deleteSession('unknown-token')).resolves.toBeUndefined()
    await expect(deleteSession(undefined)).resolves.toBeUndefined()
    await expect(deleteSession('')).resolves.toBeUndefined()
  })

  it('deleteSessionsForStaff：その営業のセッションをすべて削除し、他の営業のセッションは残す（T-AUTH-10）', async () => {
    const pc = await createSession(SEED_STAFF.yamada.id, NOW)
    const phone = await createSession(SEED_STAFF.yamada.id, NOW)
    const sato = await createSession(SEED_STAFF.sato.id, NOW)

    expect(await deleteSessionsForStaff(SEED_STAFF.yamada.id)).toBe(2)

    expect(await validateSessionToken(pc.token, NOW)).toBeNull()
    expect(await validateSessionToken(phone.token, NOW)).toBeNull()
    expect(await validateSessionToken(sato.token, NOW)).not.toBeNull()
  })

  it('deleteExpiredSessions：期限切れのセッションだけを削除する', async () => {
    await createSession(SEED_STAFF.yamada.id, NOW)
    await createSession(SEED_STAFF.sato.id, after(24 * HOUR))

    expect(await deleteExpiredSessions(after(SESSION_TTL_MS))).toBe(1)
    expect(await prisma.session.count()).toBe(1)
  })
})

describe('ログイン中のユーザーの取得', () => {
  it('Route Handler：リクエストの Cookie からログイン中のユーザーを返す', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id)

    expect((await getCurrentUser(requestWithCookie(token)))?.id).toBe(SEED_STAFF.yamada.id)
    expect((await getCurrentSession(requestWithCookie(token)))?.user.name).toBe(SEED_STAFF.yamada.name)
  })

  it('Route Handler：Cookie がない・不正なら null', async () => {
    expect(await getCurrentUser(requestWithCookie())).toBeNull()
    expect(await getCurrentUser(requestWithCookie('unknown-token'))).toBeNull()
  })

  it('Server Component：引数なしなら next/headers の cookies() から読む', async () => {
    const { token } = await createSession(SEED_STAFF.suzuki.id)

    cookieStore.value = token
    expect((await getCurrentUser())?.id).toBe(SEED_STAFF.suzuki.id)

    cookieStore.value = undefined
    expect(await getCurrentUser()).toBeNull()
  })

  it('requireCurrentUser：ログインしていなければ UnauthenticatedError（401）を投げる', async () => {
    const { token } = await createSession(SEED_STAFF.yamada.id)

    await expect(requireCurrentUser(requestWithCookie(token))).resolves.toMatchObject({ id: SEED_STAFF.yamada.id })
    await expect(requireCurrentUser(requestWithCookie())).rejects.toBeInstanceOf(UnauthenticatedError)
  })
})
