import 'server-only'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'

/**
 * セッション Cookie の操作（docs/api.md §1.2）
 *
 * DB を使わないので、proxy（src/proxy.ts）からも使える。セッションの作成・確認は session.ts で行う
 */

/** セッションの有効期間（最後のアクセスから 7 日） */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Cookie を書き込める先（`NextResponse.cookies` や、Route Handler の `await cookies()`） */
export interface WritableCookies {
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

/**
 * セッション Cookie を設定する。
 * ログイン時と Route Handler では DB のセッションの有効期限と同じにし、proxy では「今から 7 日」にする（決定事項 #28）
 */
export function setSessionCookie(target: WritableCookies, token: string, expiresAt: Date): void {
  target.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt))
}

/** セッション Cookie を消す（ログアウト時）。有効期限を過去にして上書きする */
export function clearSessionCookie(target: WritableCookies): void {
  target.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(new Date(0)))
}
