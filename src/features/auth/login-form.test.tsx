import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { ERROR_MESSAGES, LOGIN_MESSAGES } from '@/lib/messages'

import { LoginForm } from './login-form'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))

const post = vi.fn()
const setCsrfToken = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof apiClient>()),
  api: { post: (...args: unknown[]) => post(...args) },
  setCsrfToken: (token: string | null) => setCsrfToken(token),
}))

const loggedIn = (role: 'sales' | 'manager' | 'admin') => ({ data: { id: 1, name: '山田太郎', role, csrf_token: 'csrf-token' } })

function renderForm(next?: string) {
  render(<LoginForm next={next} />)
  const user = userEvent.setup()
  return {
    user,
    email: () => screen.getByRole('textbox', { name: /メールアドレス/ }),
    password: () => screen.getByLabelText(/パスワード/),
    submit: () => screen.getByRole('button', { name: /ログイン/ }),
    async login(email = 'yamada@example.com', password = 'Passw0rd') {
      await user.type(screen.getByRole('textbox', { name: /メールアドレス/ }), email)
      await user.type(screen.getByLabelText(/パスワード/), password)
      await user.click(screen.getByRole('button', { name: 'ログイン' }))
    },
  }
}

describe('ログインフォーム（SC-01）', () => {
  it('メールアドレスとパスワードの入力欄があり、どちらも必須（*）', () => {
    const form = renderForm()

    expect(screen.getByLabelText('メールアドレス*（必須）')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('パスワード*（必須）')).toHaveAttribute('type', 'password')
    expect(form.submit()).toBeEnabled()
  })

  it('空のまま送信すると、各項目の下に必須エラーが出て、API は呼ばない（M-02）', async () => {
    const form = renderForm()

    await form.user.click(form.submit())

    expect(await screen.findByText('メールアドレスは必須です')).toBeInTheDocument()
    expect(screen.getByText('パスワードは必須です')).toBeInTheDocument()
    expect(form.email()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('メール形式でなければエラー', async () => {
    const form = renderForm()

    await form.login('yamada', 'Passw0rd')

    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    ['sales', '/reports'],
    ['manager', '/reports'],
    ['admin', '/customers'],
  ] as const)('T-UI-01: %s でログインすると %s へ移る', async (role, path) => {
    post.mockResolvedValue(loggedIn(role))
    const form = renderForm()

    await form.login()

    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'yamada@example.com', password: 'Passw0rd' })
    expect(setCsrfToken).toHaveBeenCalledWith('csrf-token')
    expect(replace).toHaveBeenCalledWith(path)
  })

  it('戻り先（next）があれば、そちらへ移る', async () => {
    post.mockResolvedValue(loggedIn('sales'))
    const form = renderForm('/reports/101?from=mail')

    await form.login()

    expect(replace).toHaveBeenCalledWith('/reports/101?from=mail')
  })

  it('戻り先が別のサイトなら使わず、トップ画面へ移る（オープンリダイレクトの防止）', async () => {
    post.mockResolvedValue(loggedIn('sales'))
    const form = renderForm('//evil.example/')

    await form.login()

    expect(replace).toHaveBeenCalledWith('/reports')
  })

  it('送信中はボタンを押せない（二重送信の防止）', async () => {
    let resolve: (value: unknown) => void = () => undefined
    post.mockReturnValue(new Promise((r) => (resolve = r)))
    const form = renderForm()

    await form.login()

    expect(screen.getByRole('button', { name: 'ログインしています…' })).toBeDisabled()
    await form.user.click(screen.getByRole('button', { name: 'ログインしています…' }))
    expect(post).toHaveBeenCalledTimes(1)

    resolve(loggedIn('sales'))
    // 成功して画面が移るまでの間も押せない
    await vi.waitFor(() => expect(replace).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'ログインしています…' })).toBeDisabled()
  })

  it('T-AUTH-02: 認証に失敗したら M-01 を出し、パスワードを消してもう一度押せるようにする', async () => {
    post.mockRejectedValue(new ApiClientError(401, 'UNAUTHENTICATED', LOGIN_MESSAGES.failed))
    const form = renderForm()

    await form.login('yamada@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.failed)
    expect(form.email()).toHaveValue('yamada@example.com')
    expect(form.password()).toHaveValue('')
    expect(form.password()).toHaveFocus()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('T-UI-27: 試行回数の上限（429）なら M-13 を出す', async () => {
    post.mockRejectedValue(new ApiClientError(429, 'TOO_MANY_ATTEMPTS', 'しばらくログインできません'))
    const form = renderForm()

    await form.login()

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.locked)
  })

  it('もう一度送信すると、前のエラーは消える', async () => {
    post.mockRejectedValueOnce(new ApiClientError(401, 'UNAUTHENTICATED', LOGIN_MESSAGES.failed))
    post.mockResolvedValueOnce(loggedIn('sales'))
    const form = renderForm()

    await form.login('yamada@example.com', 'wrong')
    await screen.findByRole('alert')
    await form.user.type(form.password(), 'Passw0rd')
    await form.user.click(screen.getByRole('button', { name: 'ログイン' }))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/reports'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('API の入力チェックエラー（400）は該当する項目の下に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'password', message: 'パスワードは256文字以内で入力してください' },
      ]),
    )
    const form = renderForm()

    await form.login()

    expect(await screen.findByText('パスワードは256文字以内で入力してください')).toBeInTheDocument()
  })

  it('通信エラーなどは、フォームの上にエラーを出す', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'))
    const form = renderForm()

    await form.login()

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_MESSAGES.network)
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })
})
