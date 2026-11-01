import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCsrfToken } from '@/lib/api-client'
import { LOGIN_MESSAGES } from '@/lib/messages'

import { LoginForm } from './login-form'

/**
 * API クライアントをモックにせず、fetch だけを差し替えて、ログインフォームから実際に送られるリクエストを確かめる。
 * login-form.test.tsx は API クライアントをモックにしているため、API クライアントの動き（CSRF トークンの取得など）を通らない
 */

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** ログイン API には成功を、それ以外（GET /auth/me など）にはログイン前と同じ 401 を返す */
function mockServer(loginResponse: Response) {
  const fetchMock = vi.fn(async (url: string) =>
    url === '/api/v1/auth/login'
      ? loginResponse
      : json(401, { error: { code: 'UNAUTHENTICATED', message: 'ログインしてください' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  setCsrfToken(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function login() {
  const user = userEvent.setup()
  render(<LoginForm />)
  await user.type(screen.getByRole('textbox', { name: /メールアドレス/ }), 'yamada@example.com')
  await user.type(screen.getByLabelText(/パスワード/), 'Passw0rd')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
}

describe('ログインフォームから送るリクエスト', () => {
  it('ログイン前でも、ログイン API だけを呼んでログインできる（CSRF トークンを取りに行かない）', async () => {
    const fetchMock = mockServer(json(200, { data: { id: 2, name: '山田太郎', role: 'sales', csrf_token: 'csrf-token' } }))

    await login()

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/reports'))
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/auth/login'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('パスワードが違えば、サーバーの 401 で M-01 を出す', async () => {
    mockServer(json(401, { error: { code: 'UNAUTHENTICATED', message: LOGIN_MESSAGES.failed } }))

    await login()

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.failed)
    expect(replace).not.toHaveBeenCalled()
  })
})
