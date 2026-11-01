import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { CSRF_HEADER_NAME } from '@/lib/api-constants'
import { ForbiddenError } from '@/server/api/errors'

/**
 * CSRF 対策（docs/api.md §1.2、決定事項 #27）
 *
 * 更新系のリクエスト（POST・PUT・PATCH・DELETE）で、次の 2 つを確かめる。どちらかに失敗したら 403
 * 1. `Origin` ヘッダーがあれば、このサイトのホストと一致すること
 * 2. `X-CSRF-Token` ヘッダーが、セッションの CSRF トークンと一致すること（比較にかかる時間は一定）
 *
 * 別のサイトのページからは、`X-CSRF-Token` のような独自のヘッダーを付けたリクエストを送れない
 * （CORS で止められる）。そのため、このヘッダーを確かめるだけで、別のサイトからの「なりすまし更新」を防げる
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** CSRF の確認に失敗したときのメッセージ（画面の API クライアントは自動で 1 回だけ再送する） */
export const CSRF_ERROR_MESSAGE = 'リクエストを確認できませんでした。画面を再読み込みしてから、もう一度お試しください'

/** 更新系のメソッドか（CSRF の確認が必要か） */
export function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase())
}

/**
 * 更新系のリクエストなら、Origin と CSRF トークンを確かめる。問題があれば `ForbiddenError`（403）を投げる。
 * GET などの読み取りのリクエストでは何もしない
 */
export function verifyCsrf(request: NextRequest, expectedToken: string): void {
  if (!isUnsafeMethod(request.method)) {
    return
  }
  verifyOrigin(request)
  if (!tokensMatch(request.headers.get(CSRF_HEADER_NAME), expectedToken)) {
    throw csrfError()
  }
}

/**
 * `Origin` ヘッダーがあれば、このサイトのホストと一致するか確かめる（一致しなければ 403）。
 * ログイン API（セッションがまだない）でも使う。
 *
 * - スキーム（http / https）は比べない。Cloud Run では TLS が手前で終わり、サーバーから見た URL が http になることがあるため
 * - `Origin` がないリクエスト（同じサイトの古いブラウザ・curl など）は通す。CSRF トークンの確認で防ぐ
 */
export function verifyOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin')
  if (origin === null) {
    return
  }
  const expectedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
  if (originHost(origin) !== expectedHost.toLowerCase()) {
    throw csrfError()
  }
}

/** Origin のホスト部分（ポート付き）。`null` や解釈できない値は空文字にして、必ず不一致にする */
function originHost(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase()
  } catch {
    return ''
  }
}

/** 2 つのトークンが一致するか。長さの違いからも情報を漏らさないよう、SHA-256 にそろえてから一定時間で比べる */
function tokensMatch(actual: string | null, expected: string): boolean {
  if (actual === null || actual === '' || expected === '') {
    return false
  }
  return timingSafeEqual(sha256(actual), sha256(expected))
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function csrfError(): ForbiddenError {
  return new ForbiddenError(CSRF_ERROR_MESSAGE, 'CSRF_TOKEN_INVALID')
}
