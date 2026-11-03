import type { Role } from '@/generated/prisma/client'

/**
 * 画面のパスと、画面の遷移に使う関数（サーバー・ブラウザの両方で使う）
 */

/** ログイン画面（SC-01） */
export const LOGIN_PATH = '/login'

/** ログイン後に元の画面へ戻すためのクエリパラメータ名（例：`/login?next=/reports/101`） */
export const NEXT_PARAM = 'next'

/** ロールごとのトップ画面（docs/screens.md §2：営業・上長は日報一覧 SC-02、管理者は顧客一覧 SC-05） */
export function homePathForRole(role: Role): string {
  return role === 'ADMIN' ? '/customers' : '/reports'
}

/** ログイン画面の URL。`next` に戻り先を付ける（トップ画面のときは付けない） */
export function loginPath(next?: string): string {
  if (next === undefined || next === '/' || safeRedirectPath(next) === null) {
    return LOGIN_PATH
  }
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: next }).toString()}`
}

/**
 * 戻り先として安全なパス（このサイトの中のパス）なら、そのまま返す。そうでなければ `null`。
 *
 * `?next=` はだれでも書き換えられるため、別のサイトに飛ばす「オープンリダイレクト」に使われないよう、次を受け付けない
 * - `/` で始まらないもの（`https://evil.example`・`javascript:alert(1)` など）
 * - `//evil.example`（プロトコル相対 URL。ブラウザは別のサイトとして扱う）
 * - `/\evil.example`（ブラウザによっては `\` を `/` とみなし、`//evil.example` と同じになる）
 * - 制御文字（タブ・改行など。ブラウザは取り除いてから解釈するため、`/\t/evil.example` が `//evil.example` になる）
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null
  }
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return null
  }
  // 「/a/../b」などを、ブラウザと同じ規則で正規化する（上の条件を満たす値は、必ずこのサイトの中のパスになる）
  const url = new URL(value, 'http://localhost')
  return `${url.pathname}${url.search}${url.hash}`
}

/** 日報一覧（SC-02） */
export const REPORT_LIST_PATH = '/reports'

/** 日報詳細（SC-04） */
export function reportDetailPath(id: number): string {
  return `${REPORT_LIST_PATH}/${id}`
}

/**
 * proxy が、表示しようとしている画面のパス（クエリを含む）を Server Component に伝えるリクエストヘッダー。
 * Server Component からはリクエストの URL を読めないため、ログイン画面へ戻すときの `next` を作るのに使う。
 * ブラウザから同じ名前のヘッダーが送られても、proxy が上書きする
 */
export const REQUEST_PATH_HEADER = 'x-nipo-request-path'

/** ヘッダーのメニューの項目 */
export interface NavItem {
  label: string
  href: string
}

/** ロールごとのヘッダーのメニュー（docs/screens.md §3.1、T-UI-03）。営業・上長は日報一覧、管理者は顧客・営業 */
export function navItemsForRole(role: Role): NavItem[] {
  if (role === 'ADMIN') {
    return [
      { label: '顧客', href: '/customers' },
      { label: '営業', href: '/staff' },
    ]
  }
  return [{ label: '日報一覧', href: '/reports' }]
}

/** 現在の画面がメニューの項目に含まれるか（`/reports/101` は「日報一覧」に含まれる） */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
