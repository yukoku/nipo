import { beforeEach, describe, expect, it, vi } from 'vitest'

import { REQUEST_PATH_HEADER } from '@/lib/routes'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '@/server/api/errors'

import { redirectIfAuthenticated, rethrowAsPageError, requirePageRole, requirePageUser } from './page-auth'
import type { CurrentUser } from './session'

// next/navigation の redirect・forbidden・notFound は例外を投げて描画を止める。テストでは中身の分かる例外にする
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
  forbidden: vi.fn(() => {
    throw new Error('forbidden')
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
}))

const requestHeaders = new Headers()
vi.mock('next/headers', () => ({ headers: vi.fn(async () => requestHeaders) }))

const getCurrentUser = vi.fn<() => Promise<CurrentUser | null>>()
vi.mock('./session', () => ({ getCurrentUser: () => getCurrentUser() }))

const user = (role: CurrentUser['role']): CurrentUser => ({
  id: 2,
  name: '山田太郎',
  email: 'yamada@example.com',
  role,
  department: '営業1課',
  managerId: 1,
})

beforeEach(() => {
  requestHeaders.delete(REQUEST_PATH_HEADER)
})

describe('requirePageUser', () => {
  it('ログイン中ならユーザーを返す', async () => {
    getCurrentUser.mockResolvedValue(user('SALES'))

    await expect(requirePageUser()).resolves.toMatchObject({ id: 2 })
  })

  it('セッションが無効なら、表示しようとした画面を next に付けてログイン画面へ（期限切れの Cookie が残っている場合）', async () => {
    getCurrentUser.mockResolvedValue(null)
    requestHeaders.set(REQUEST_PATH_HEADER, '/reports/101')

    await expect(requirePageUser()).rejects.toThrow('redirect:/login?next=%2Freports%2F101')
  })

  it('画面のパスが分からなければ next を付けない', async () => {
    getCurrentUser.mockResolvedValue(null)

    await expect(requirePageUser()).rejects.toThrow('redirect:/login')
  })
})

describe('requirePageRole', () => {
  it('SC-T-04 手順3: 営業が管理者用の画面を開くと 403 画面', async () => {
    getCurrentUser.mockResolvedValue(user('SALES'))

    await expect(requirePageRole('ADMIN')).rejects.toThrow('forbidden')
  })

  it('管理者は日報の画面を開けない（決定事項 #7）', async () => {
    getCurrentUser.mockResolvedValue(user('ADMIN'))

    await expect(requirePageRole('SALES', 'MANAGER')).rejects.toThrow('forbidden')
  })

  it('ロールが合っていればユーザーを返す', async () => {
    getCurrentUser.mockResolvedValue(user('MANAGER'))

    await expect(requirePageRole('SALES', 'MANAGER')).resolves.toMatchObject({ role: 'MANAGER' })
  })

  it('ログインしていなければ、403 ではなくログイン画面へ', async () => {
    getCurrentUser.mockResolvedValue(null)

    await expect(requirePageRole('ADMIN')).rejects.toThrow('redirect:/login')
  })
})

describe('redirectIfAuthenticated（ログイン画面）', () => {
  it('ログインしていなければ何もしない（ログイン画面を表示する）', async () => {
    getCurrentUser.mockResolvedValue(null)

    await expect(redirectIfAuthenticated('/reports')).resolves.toBeUndefined()
  })

  it('ログイン済みなら、ロールごとのトップ画面へ', async () => {
    getCurrentUser.mockResolvedValue(user('ADMIN'))

    await expect(redirectIfAuthenticated()).rejects.toThrow('redirect:/customers')
  })

  it('ログイン済みで安全な戻り先があれば、そこへ', async () => {
    getCurrentUser.mockResolvedValue(user('SALES'))

    await expect(redirectIfAuthenticated('/reports/101')).rejects.toThrow('redirect:/reports/101')
  })

  it('戻り先が別のサイトや複数指定なら、トップ画面へ（オープンリダイレクトの防止）', async () => {
    getCurrentUser.mockResolvedValue(user('SALES'))

    await expect(redirectIfAuthenticated('//evil.example')).rejects.toThrow('redirect:/reports')
    await expect(redirectIfAuthenticated(['/a', '/b'])).rejects.toThrow('redirect:/reports')
  })
})

describe('rethrowAsPageError', () => {
  it('services のエラーを画面のエラーに変える', () => {
    expect(() => rethrowAsPageError(new NotFoundError())).toThrow('notFound')
    expect(() => rethrowAsPageError(new ForbiddenError())).toThrow('forbidden')
    expect(() => rethrowAsPageError(new UnauthenticatedError())).toThrow('redirect:/login')
  })

  it('それ以外のエラーはそのまま投げ直す', () => {
    const error = new Error('DB に接続できません')

    expect(() => rethrowAsPageError(error)).toThrow(error)
  })
})
