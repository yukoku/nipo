import { type NextRequest, NextResponse } from 'next/server'

import { SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { LOGIN_PATH, REQUEST_PATH_HEADER, loginPath } from '@/lib/routes'
import { SESSION_TTL_MS, setSessionCookie } from '@/server/auth/session-cookie'

/**
 * 画面へのリクエストの前に動く処理（Next.js 16 で middleware.ts から名前が変わった proxy）
 *
 * ここではセッション Cookie が「あるか」だけを見る。セッションが正しいか・ロールが合っているかは、
 * 各画面（`requirePageUser()`・`requirePageRole()`）と Route Handler（`requireAuth()`）で DB を見て確かめる。
 * proxy だけに頼らないのは、matcher の設定漏れなどで確認が抜けても、画面・API 側で必ず止められるようにするため
 * （Next.js のデータセキュリティのガイドに沿う）
 *
 * 1. Cookie がなければ、ログイン画面へリダイレクトする（T-UI-02）。ログイン後に戻れるよう `?next=` を付ける
 * 2. Cookie があれば、Cookie の有効期限を「今から 7 日」に延ばす（決定事項 #28）
 * 3. 表示する画面のパスをヘッダーで画面に伝える（セッションが無効だったときに `?next=` を付けるため）
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value

  // ログイン画面は誰でも開ける。ログイン済みならトップ画面に移る処理は、ログイン画面で DB を見て行う
  if (pathname === LOGIN_PATH) {
    return NextResponse.next()
  }

  const requestPath = `${pathname}${search}`
  if (token === undefined || token === '') {
    return NextResponse.redirect(new URL(loginPath(requestPath), request.url))
  }

  const headers = new Headers(request.headers)
  headers.set(REQUEST_PATH_HEADER, requestPath)
  const response = NextResponse.next({ request: { headers } })
  setSessionCookie(response.cookies, token, new Date(Date.now() + SESSION_TTL_MS))
  return response
}

export const config = {
  // API（Route Handler が自分で 401 を返す）、Next.js の静的ファイル、開発用の画面（/dev/*。本番では 404）、拡張子の付いたファイルは対象外
  matcher: ['/((?!api(?:/|$)|_next/|dev(?:/|$)|.*\\.[A-Za-z0-9]+$).*)'],
}
