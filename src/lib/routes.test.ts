import { describe, expect, it } from 'vitest'

import {
  LOGIN_PATH,
  REPORT_LIST_PATH,
  REPORT_LIST_QUERY_PARAM,
  REPORT_NEW_PATH,
  homePathForRole,
  isNavItemActive,
  loginPath,
  navItemsForRole,
  reportDetailPath,
  reportEditPath,
  reportListPath,
  safeRedirectPath,
} from './routes'

describe('homePathForRole', () => {
  it('営業・上長は日報一覧、管理者は顧客一覧（T-UI-01）', () => {
    expect(homePathForRole('SALES')).toBe('/reports')
    expect(homePathForRole('MANAGER')).toBe('/reports')
    expect(homePathForRole('ADMIN')).toBe('/customers')
  })
})

describe('safeRedirectPath（オープンリダイレクトの防止）', () => {
  it.each(['/reports', '/reports/101', '/reports?date_from=2026-10-01&customer_name=%E5%95%86%E4%BA%8B', '/customers#top'])(
    'このサイトの中のパス %s はそのまま返す',
    (path) => {
      expect(safeRedirectPath(path)).toBe(path)
    },
  )

  it.each([
    null,
    undefined,
    '',
    'reports',
    'https://evil.example/',
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('別のサイトに飛ぶおそれのある値 %j は null', (value) => {
    expect(safeRedirectPath(value)).toBeNull()
  })

  it('「..」などは URL として正規化したパスを返す', () => {
    expect(safeRedirectPath('/reports/../customers')).toBe('/customers')
  })
})

describe('loginPath', () => {
  it('戻り先を next に付ける', () => {
    expect(loginPath('/reports/101?x=1')).toBe('/login?next=%2Freports%2F101%3Fx%3D1')
  })

  it('戻り先がない・トップ画面・安全でないときは付けない', () => {
    expect(loginPath()).toBe(LOGIN_PATH)
    expect(loginPath('/')).toBe(LOGIN_PATH)
    expect(loginPath('//evil.example')).toBe(LOGIN_PATH)
  })
})

describe('navItemsForRole（T-UI-03）', () => {
  it('営業・上長は「日報一覧」のみ', () => {
    expect(navItemsForRole('SALES')).toEqual([{ label: '日報一覧', href: '/reports' }])
    expect(navItemsForRole('MANAGER')).toEqual([{ label: '日報一覧', href: '/reports' }])
  })

  it('管理者は「顧客」「営業」のみ', () => {
    expect(navItemsForRole('ADMIN').map((item) => item.label)).toEqual(['顧客', '営業'])
  })
})

describe('isNavItemActive', () => {
  const reports = { label: '日報一覧', href: '/reports' }

  it('その画面と配下の画面で true', () => {
    expect(isNavItemActive(reports, '/reports')).toBe(true)
    expect(isNavItemActive(reports, '/reports/101/edit')).toBe(true)
  })

  it('名前が前方一致するだけの別の画面では false', () => {
    expect(isNavItemActive(reports, '/reports-archive')).toBe(false)
    expect(isNavItemActive(reports, '/customers')).toBe(false)
  })
})

describe('日報の画面のパス', () => {
  it('日報一覧は /reports、日報詳細は /reports/{id}', () => {
    expect(REPORT_LIST_PATH).toBe('/reports')
    expect(reportDetailPath(101)).toBe('/reports/101')
    expect(reportEditPath(101)).toBe('/reports/101/edit')
    expect(REPORT_NEW_PATH).toBe('/reports/new')
  })

  it('日報詳細のパスに、一覧の検索条件（クエリ文字列）を付けられる', () => {
    expect(REPORT_LIST_QUERY_PARAM).toBe('list')
    expect(reportDetailPath(101, '?date_from=2026-10-01&page=2')).toBe(
      '/reports/101?list=date_from%3D2026-10-01%26page%3D2',
    )
    expect(reportDetailPath(101, '')).toBe('/reports/101')
  })

  it('日報一覧のパスは、受け取った検索条件をクエリとして作り直す（別の画面・サイトへは移らない）', () => {
    expect(reportListPath('date_from=2026-10-01&page=2')).toBe('/reports?date_from=2026-10-01&page=2')
    expect(reportListPath('?customer_name=ABC商事')).toBe('/reports?customer_name=ABC%E5%95%86%E4%BA%8B')
    expect(reportListPath(null)).toBe('/reports')
    expect(reportListPath('')).toBe('/reports')
    expect(reportListPath('//evil.example/#x')).toBe('/reports?%2F%2Fevil.example%2F%23x=')
  })
})
