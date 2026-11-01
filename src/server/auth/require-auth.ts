import 'server-only'

import type { NextRequest } from 'next/server'

import { UnauthenticatedError } from '@/server/api/errors'
import { verifyCsrf } from '@/server/auth/csrf'
import { getCurrentSession, type AuthenticatedSession } from '@/server/auth/session'

/**
 * ログインが必要な API の入口。Route Handler の最初に呼ぶ。
 *
 * 1. ログインしていなければ `UnauthenticatedError`（401）
 * 2. 更新系のメソッド（POST・PUT・PATCH・DELETE）なら、Origin と `X-CSRF-Token` を確かめる。失敗したら `ForbiddenError`（403）
 *
 * 401 を 403 より先に判定する（ログインしていない人には「ログインしてください」を返す）
 *
 * @example
 * export const POST = withApi(async (request) => {
 *   const { user } = await requireAuth(request)
 *   ...
 * })
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedSession> {
  const session = await getCurrentSession(request)
  if (session === null) {
    throw new UnauthenticatedError()
  }
  verifyCsrf(request, session.session.csrfToken)
  return session
}
