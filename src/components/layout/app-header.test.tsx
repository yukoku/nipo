import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'
import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { ERROR_MESSAGES } from '@/lib/messages'

import { AppHeader, type HeaderUser } from './app-header'

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }
let pathname = '/reports'
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => pathname }))

const post = vi.fn()
const setCsrfToken = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof apiClient>()),
  api: { post: (...args: unknown[]) => post(...args) },
  setCsrfToken: (token: string | null) => setCsrfToken(token),
}))

const notifyError = vi.fn()
vi.mock('@/lib/notify', () => ({ notifyError: (message: string) => notifyError(message) }))

const YAMADA: HeaderUser = { name: '山田太郎', role: 'SALES' }
const SUZUKI: HeaderUser = { name: '鈴木一郎', role: 'MANAGER' }
const ADMIN: HeaderUser = { name: '管理者', role: 'ADMIN' }

function renderHeader(user: HeaderUser) {
  render(
    <AppProviders>
      <AppHeader user={user} />
    </AppProviders>,
  )
  return userEvent.setup()
}

const mainMenuLinks = () =>
  within(screen.getByRole('navigation', { name: 'メインメニュー' }))
    .getAllByRole('link')
    .map((link) => link.textContent)

async function clickLogout(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `${name}のメニュー` }))
  await user.click(await screen.findByRole('menuitem', { name: 'ログアウト' }))
}

beforeEach(() => {
  pathname = '/reports'
})

describe('ヘッダーのメニュー（T-UI-03）', () => {
  it('営業・上長は「日報一覧」のみ', () => {
    renderHeader(YAMADA)
    expect(mainMenuLinks()).toEqual(['日報一覧'])
  })

  it('上長も「日報一覧」のみ', () => {
    renderHeader(SUZUKI)
    expect(mainMenuLinks()).toEqual(['日報一覧'])
  })

  it('管理者は「顧客」「営業」のみ', () => {
    pathname = '/customers'
    renderHeader(ADMIN)
    expect(mainMenuLinks()).toEqual(['顧客', '営業'])
  })

  it('システム名とログインユーザー名を表示し、今いる画面のメニューに印を付ける', () => {
    pathname = '/staff/2'
    renderHeader(ADMIN)

    expect(screen.getByRole('link', { name: '営業日報システム' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: '管理者のメニュー' })).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'メインメニュー' }))
    expect(nav.getByRole('link', { name: '営業' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: '顧客' })).not.toHaveAttribute('aria-current')
  })

  it('スマートフォン幅のメニュー（≡）にも同じ項目が出る', async () => {
    const user = renderHeader(ADMIN)

    await user.click(screen.getByRole('button', { name: 'メニューを開く' }))
    const items = await screen.findAllByRole('menuitem')

    expect(items.map((item) => item.textContent)).toEqual(['顧客', '営業'])
    expect(items[0]).toHaveAttribute('href', '/customers')
  })
})

describe('ログアウト', () => {
  it('ログアウト API を呼び、CSRF トークンを消してログイン画面へ移る', async () => {
    post.mockResolvedValue(null)
    const user = renderHeader(YAMADA)

    await clickLogout(user, '山田太郎')

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(setCsrfToken).toHaveBeenCalledWith(null)
    expect(router.replace).toHaveBeenCalledWith('/login')
  })

  it('セッションが既に切れていた（401）ときも、ログイン画面へ移る', async () => {
    post.mockRejectedValue(new ApiClientError(401, 'UNAUTHENTICATED', 'ログインしてください'))
    const user = renderHeader(YAMADA)

    await clickLogout(user, '山田太郎')

    expect(router.replace).toHaveBeenCalledWith('/login')
  })

  it('通信に失敗したら、エラーを出してこの画面に残る', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = renderHeader(YAMADA)

    await clickLogout(user, '山田太郎')

    expect(notifyError).toHaveBeenCalledWith(ERROR_MESSAGES.logoutFailed)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
