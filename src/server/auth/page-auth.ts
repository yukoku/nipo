import 'server-only'

import { headers } from 'next/headers'
import { forbidden, notFound, redirect } from 'next/navigation'

import type { Role } from '@/generated/prisma/client'
import { LOGIN_PATH, REQUEST_PATH_HEADER, homePathForRole, loginPath, safeRedirectPath } from '@/lib/routes'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '@/server/api/errors'
import { hasRole } from '@/server/authz/role'

import { type CurrentUser, getCurrentUser } from './session'

/**
 * 画面（Server Component）用の認証・認可（docs/screens.md §3.1）
 *
 * proxy（src/proxy.ts）は Cookie があるかしか見ないため、セッションが正しいか・ロールが合っているかは、
 * **各ページ（page.tsx）の最初で** ここの関数を呼んで確かめる。
 * レイアウト（layout.tsx）では確かめない。レイアウトは画面を移動しても描画し直されず、ページの描画も止められないため
 * （Next.js の認証ガイド「Layouts and auth checks」）
 */

/**
 * ログイン中のユーザーを返す。ログインしていなければ（セッションの期限切れ・無効化を含む）、ログイン画面へリダイレクトする
 *
 * @example
 * export default async function ReportsPage() {
 *   const user = await requirePageUser()
 * }
 */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (user === null) {
    const requestPath = (await headers()).get(REQUEST_PATH_HEADER) ?? undefined
    redirect(loginPath(requestPath))
  }
  return user
}

/**
 * ログイン中のユーザーのロールが、指定したロールのどれかであることを確かめる。違えば 403 画面（forbidden.tsx）を出す
 *
 * @example
 * await requirePageRole('ADMIN')               // 顧客・営業の画面（SC-05〜SC-08）
 * await requirePageRole('SALES', 'MANAGER')    // 日報の画面（SC-02〜SC-04）
 */
export async function requirePageRole(...roles: [Role, ...Role[]]): Promise<CurrentUser> {
  const user = await requirePageUser()
  if (!hasRole(user, ...roles)) {
    forbidden()
  }
  return user
}

/**
 * ログイン画面用。ログイン済みなら、戻り先（`?next=`）か、ロールごとのトップ画面へリダイレクトする
 */
export async function redirectIfAuthenticated(next?: string | string[]): Promise<void> {
  const user = await getCurrentUser()
  if (user !== null) {
    redirect(safeRedirectPath(typeof next === 'string' ? next : undefined) ?? homePathForRole(user.role))
  }
}

/**
 * services が投げたエラーを、画面のエラーに変える。画面から services を呼ぶときに使う
 *
 * - `NotFoundError` → 404 画面（閲覧できない日報も「見つかりません」にする。SC-T-04）
 * - `ForbiddenError` → 403 画面
 * - `UnauthenticatedError` → ログイン画面
 * - それ以外はそのまま投げ直す（エラー画面になる）
 *
 * @example
 * const report = await getReport(user, id).catch(rethrowAsPageError)
 */
export function rethrowAsPageError(error: unknown): never {
  if (error instanceof NotFoundError) {
    notFound()
  }
  if (error instanceof ForbiddenError) {
    forbidden()
  }
  if (error instanceof UnauthenticatedError) {
    redirect(LOGIN_PATH)
  }
  throw error
}
