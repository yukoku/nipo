import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '@/lib/api-constants'
import { createSession } from '@/server/auth/session'
import { SEED_STAFF } from '@/server/db/seed/data'

export type SeedStaffKey = keyof typeof SEED_STAFF

export interface LoggedIn {
  /** `callRoute(..., { headers })` にそのまま渡せるヘッダー（セッション Cookie と CSRF トークン） */
  headers: { cookie: string; [CSRF_HEADER_NAME]: string }
  token: string
  csrfToken: string
  staffId: number
}

/**
 * テストデータの営業でログインした状態を作る（APIテスト用）。
 *
 * ログイン API を通さず、DB にセッションを直接作る（ログイン API の不具合に、他の API のテストが巻き込まれないようにするため）。
 *
 * @example
 * const yamada = await loginAs('yamada')
 * const response = await callRoute(POST, '/api/v1/reports', { method: 'POST', body, headers: yamada.headers })
 */
export async function loginAs(staff: SeedStaffKey): Promise<LoggedIn> {
  const staffId = SEED_STAFF[staff].id
  const { token, csrfToken } = await createSession(staffId)
  return {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, [CSRF_HEADER_NAME]: csrfToken },
    token,
    csrfToken,
    staffId,
  }
}
