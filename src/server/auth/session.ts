import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { cache } from 'react'

import type { Role } from '@/generated/prisma/client'
import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { UnauthenticatedError } from '@/server/api/errors'
import { prisma } from '@/server/db/prisma'

/**
 * DB 保存型のセッション（docs/api.md §1.2）
 *
 * - Cookie にはランダムなトークンを入れ、DB にはその SHA-256 だけを保存する（DB が漏れてもセッションを乗っ取られない）
 * - 有効期限は最後のアクセスから 7 日。アクセスのたびに DB の有効期限を延ばす（書き込みは 1 時間に 1 回まで）
 * - 期限切れ・無効化された営業のセッションでは認証しない（見つけた時点で削除する）
 * - 期限切れのセッションは、新しいセッションを作るとき（ログイン時）にまとめて削除する
 */

/** セッションの有効期間（最後のアクセスから 7 日） */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 有効期限を延ばす間隔。アクセスのたびに DB へ書き込まないよう、前回の延長から 1 時間たったときだけ延ばす */
export const SESSION_RENEW_INTERVAL_MS = 60 * 60 * 1000

/** トークンとして受け付ける最大の長さ（極端に長い Cookie でハッシュ計算をさせないため） */
const MAX_TOKEN_LENGTH = 128

/** ログイン中のユーザー */
export interface CurrentUser {
  id: number
  name: string
  email: string
  role: Role
  department: string | null
  managerId: number | null
}

/** 認証済みのセッション */
export interface AuthenticatedSession {
  user: CurrentUser
  session: {
    id: number
    /** 更新系 API の X-CSRF-Token と照合する値（#17） */
    csrfToken: string
    expiresAt: Date
    /** このアクセスで有効期限を延ばしたか（延ばしたら Cookie の有効期限も更新する） */
    renewed: boolean
  }
}

/** 新しく作ったセッション。`token` は Cookie に入れる値で、DB には保存されない */
export interface CreatedSession {
  token: string
  csrfToken: string
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// 作成・確認・削除
// ---------------------------------------------------------------------------

/**
 * セッションを作る（ログイン時に呼ぶ）。あわせて、全ユーザーの期限切れのセッションを削除する。
 * 戻り値の `token` を `setSessionCookie()` で Cookie に設定する
 */
export async function createSession(salesStaffId: number, now: Date = new Date()): Promise<CreatedSession> {
  const token = generateToken()
  const csrfToken = generateToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  await deleteExpiredSessions(now)
  await prisma.session.create({ data: { tokenHash: hashToken(token), salesStaffId, csrfToken, expiresAt } })

  return { token, csrfToken, expiresAt }
}

/**
 * Cookie のトークンからセッションを確かめる。認証できなければ `null`。
 *
 * - セッションがない・期限切れ・営業が無効化されている場合は `null`（期限切れ・無効化のセッションは削除する）
 * - 前回の延長から 1 時間以上たっていれば、有効期限を「今から 7 日後」に延ばす
 */
export async function validateSessionToken(
  token: string | undefined,
  now: Date = new Date(),
): Promise<AuthenticatedSession | null> {
  if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) {
    return null
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      salesStaff: {
        select: { id: true, name: true, email: true, role: true, department: true, managerId: true, isActive: true },
      },
    },
  })
  if (session === null) {
    return null
  }

  if (session.expiresAt.getTime() <= now.getTime() || !session.salesStaff.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }

  let { expiresAt } = session
  const renewed = expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - SESSION_RENEW_INTERVAL_MS
  if (renewed) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt } })
  }

  const { isActive: _isActive, ...user } = session.salesStaff
  return { user, session: { id: session.id, csrfToken: session.csrfToken, expiresAt, renewed } }
}

/** セッションを削除する（ログアウト時に呼ぶ）。セッションがなくてもエラーにしない */
export async function deleteSession(token: string | undefined): Promise<void> {
  if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) {
    return
  }
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/** ある営業のセッションをすべて削除する（営業を無効化したときに呼ぶ。#24・T-AUTH-10）。削除した件数を返す */
export async function deleteSessionsForStaff(salesStaffId: number): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { salesStaffId } })
  return count
}

/** 期限切れのセッションをすべて削除する。削除した件数を返す */
export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } })
  return count
}

// ---------------------------------------------------------------------------
// ログイン中のユーザーの取得
// ---------------------------------------------------------------------------

/**
 * ログイン中のセッションを返す。ログインしていなければ `null`。
 *
 * - Route Handler からは `request` を渡す（`callRoute()` のテストでもそのまま動く）
 * - Server Component からは引数なしで呼ぶ（`next/headers` の `cookies()` で Cookie を読む）
 */
export async function getCurrentSession(request?: NextRequest): Promise<AuthenticatedSession | null> {
  if (request !== undefined) {
    return validateSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  }
  return getSessionFromCookieStore()
}

/** ログイン中のユーザーを返す。ログインしていなければ `null`（使い方は `getCurrentSession()` と同じ） */
export async function getCurrentUser(request?: NextRequest): Promise<CurrentUser | null> {
  return (await getCurrentSession(request))?.user ?? null
}

/** ログイン中のユーザーを返す。ログインしていなければ `UnauthenticatedError`（API では 401）を投げる */
export async function requireCurrentUser(request?: NextRequest): Promise<CurrentUser> {
  const user = await getCurrentUser(request)
  if (user === null) {
    throw new UnauthenticatedError()
  }
  return user
}

/**
 * Server Component 用。1 回の画面の描画の中で何度呼ばれても、DB への問い合わせは 1 回にする（React の cache）
 */
const getSessionFromCookieStore = cache(async (): Promise<AuthenticatedSession | null> => {
  const cookieStore = await cookies()
  return validateSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)
})

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

/** Cookie を書き込める先（`NextResponse.cookies` や、Route Handler の `await cookies()`） */
interface WritableCookies {
  set(name: string, value: string, options: SessionCookieOptions): unknown
}

export interface SessionCookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  expires: Date
}

/**
 * セッション Cookie の属性（docs/api.md §1.2、T-NF-05）。
 * `Secure` は本番だけ付ける。開発環境（http://localhost）では、Secure の Cookie を受け付けないブラウザ（Safari など）があるため
 */
export function sessionCookieOptions(expiresAt: Date, env: NodeJS.ProcessEnv = process.env): SessionCookieOptions {
  return { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt }
}

/** セッション Cookie を設定する。Cookie の有効期限は DB のセッションの有効期限と同じにする */
export function setSessionCookie(target: WritableCookies, token: string, expiresAt: Date): void {
  target.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt))
}

/** セッション Cookie を消す（ログアウト時）。有効期限を過去にして上書きする */
export function clearSessionCookie(target: WritableCookies): void {
  target.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(new Date(0)))
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

/** 推測できないランダムな値（256 ビット）を作る */
function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** トークンを DB に保存する形（SHA-256 の 16 進数 64 文字）にする */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
