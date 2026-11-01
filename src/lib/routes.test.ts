import { describe, expect, it } from 'vitest'

import { LOGIN_PATH, homePathForRole, isNavItemActive, loginPath, navItemsForRole, safeRedirectPath } from './routes'

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
