import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'
import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { CONFIRM_MESSAGES } from '@/lib/messages'

import { StaffForm, type StaffFormStaff } from './staff-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))

const post = vi.fn()
const put = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof apiClient>()),
  api: { post: (...args: unknown[]) => post(...args), put: (...args: unknown[]) => put(...args) },
}))

const notifySuccess = vi.fn()
const notifyError = vi.fn()
vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifySuccess(...args),
  notifyError: (...args: unknown[]) => notifyError(...args),
}))

const MANAGERS = [
  { id: 4, name: '田中次郎' },
  { id: 1, name: '鈴木一郎' },
]

const YAMADA: StaffFormStaff = {
  id: 2,
  name: '山田太郎',
  email: 'yamada@example.com',
  department: '営業1課',
  role: 'sales',
  manager: { id: 1, name: '鈴木一郎' },
  isActive: true,
  subordinateCount: 0,
}

const SUZUKI: StaffFormStaff = {
  id: 1,
  name: '鈴木一郎',
  email: 'suzuki@example.com',
  department: '営業1課',
  role: 'manager',
  manager: null,
  isActive: true,
  subordinateCount: 2,
}

function renderForm(staff?: StaffFormStaff, options: { managerOptions?: { id: number; name: string }[]; isSelf?: boolean } = {}) {
  render(
    <AppProviders>
      <StaffForm staff={staff} managerOptions={options.managerOptions ?? MANAGERS} isSelf={options.isSelf} />
    </AppProviders>,
  )
  const user = userEvent.setup()
  return {
    user,
    name: () => screen.getByRole('textbox', { name: /氏名/ }),
    email: () => screen.getByRole('textbox', { name: /メールアドレス/ }),
    password: () => screen.getByLabelText(/パスワード/),
    department: () => screen.getByRole('textbox', { name: '部署' }),
    manager: () => screen.getByRole('combobox', { name: '上長' }),
    save: () => screen.getByRole('button', { name: '保存' }),
    async selectManager(name: string) {
      await user.click(screen.getByRole('combobox', { name: '上長' }))
      await user.click(await screen.findByRole('option', { name }))
    },
    async fillRequired() {
      await user.type(screen.getByRole('textbox', { name: /氏名/ }), '木村健')
      await user.type(screen.getByRole('textbox', { name: /メールアドレス/ }), 'kimura@example.com')
      await user.type(screen.getByLabelText(/パスワード/), 'Passw0rd')
    },
  }
}

describe('営業登録（SC-08 新規）', () => {
  it('入力項目があり、氏名・メールアドレス・パスワード・権限が必須（*）。状態は表示しない', () => {
    renderForm()

    expect(screen.getByLabelText('氏名*（必須）')).toHaveValue('')
    expect(screen.getByLabelText('メールアドレス*（必須）')).toHaveValue('')
    expect(screen.getByLabelText('パスワード*（必須）')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('textbox', { name: '部署' })).toHaveValue('')
    expect(screen.getByText('権限')).toHaveTextContent('権限*（必須）')
    expect(screen.getByRole('radio', { name: '営業' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: '上長' })).toHaveTextContent('未設定')
    expect(screen.queryByRole('radiogroup', { name: '状態' })).not.toBeInTheDocument()
  })

  it('権限は営業・上長・管理者から選べる', () => {
    renderForm()

    expect(within(screen.getByRole('radiogroup', { name: '権限' })).getAllByRole('radio')).toHaveLength(3)
    for (const label of ['営業', '上長', '管理者']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('上長の選択肢は「未設定」と、渡された有効な上長', async () => {
    const form = renderForm()

    await form.user.click(form.manager())

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '未設定',
      '田中次郎',
      '鈴木一郎',
    ])
  })

  it('入力して保存すると、S-02 で登録し、M-09 を出して営業一覧へ戻る（状態は送らない）', async () => {
    post.mockResolvedValue({ data: { id: 8 } })
    const form = renderForm()

    await form.fillRequired()
    await form.user.type(form.department(), '営業3課')
    await form.user.click(screen.getByRole('radio', { name: '上長' }))
    await form.selectManager('鈴木一郎')
    await form.user.click(form.save())

    expect(post).toHaveBeenCalledWith('/sales-staff', {
      name: '木村健',
      email: 'kimura@example.com',
      password: 'Passw0rd',
      department: '営業3課',
      role: 'manager',
      manager_id: 1,
    })
    expect(notifySuccess).toHaveBeenCalledWith('saved')
    expect(push).toHaveBeenCalledWith('/staff')
  })

  it('必須項目が空なら、各項目の下に必須エラーが出て API は呼ばない（M-02）', async () => {
    const form = renderForm()

    await form.user.click(form.save())

    expect(await screen.findByText('氏名は必須です')).toBeInTheDocument()
    expect(screen.getByText('メールアドレスは必須です')).toBeInTheDocument()
    expect(screen.getByText('パスワードは必須です')).toBeInTheDocument()
    expect(form.name()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('パスワードがポリシーに合わなければ、項目の下にエラーが出る（決定事項 #25）', async () => {
    const form = renderForm()

    await form.user.type(form.name(), '木村健')
    await form.user.type(form.email(), 'kimura@example.com')
    await form.user.type(form.password(), 'password')
    await form.user.click(form.save())

    expect(form.password()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('メールアドレスの形式が正しくなければ、項目の下にエラーが出る', async () => {
    const form = renderForm()

    await form.user.type(form.name(), '木村健')
    await form.user.type(form.email(), 'kimura')
    await form.user.type(form.password(), 'Passw0rd')
    await form.user.click(form.save())

    expect(form.email()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('入力欄の最大文字数は API の上限と同じ（M-03）', () => {
    const form = renderForm()

    expect(form.name()).toHaveAttribute('maxLength', '50')
    expect(form.email()).toHaveAttribute('maxLength', '255')
    expect(form.department()).toHaveAttribute('maxLength', '50')
  })

  it('メールアドレスが重複していたら（409）、M-10 をメールアドレス欄の下に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(409, 'CONFLICT', 'このメールアドレスは既に登録されています', 'EMAIL_ALREADY_EXISTS'),
    )
    const form = renderForm()

    await form.fillRequired()
    await form.user.click(form.save())

    expect(await screen.findByText('このメールアドレスは既に登録されています')).toBeInTheDocument()
    expect(form.email()).toHaveAttribute('aria-invalid', 'true')
    expect(notifyError).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(form.save()).toBeEnabled()
  })

  it('API が 400 を返したら、該当する項目の下にエラーを出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'manager_id', message: '上長には、権限が「上長」の有効な担当者を指定してください' },
      ]),
    )
    const form = renderForm()

    await form.fillRequired()
    await form.selectManager('田中次郎')
    await form.user.click(form.save())

    expect(await screen.findByText('上長には、権限が「上長」の有効な担当者を指定してください')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('入力途中でキャンセルすると M-07 を出し、「移動する」なら営業一覧へ戻る', async () => {
    const form = renderForm()
    await form.user.type(form.name(), '木村健')

    await form.user.click(screen.getByRole('button', { name: 'キャンセル' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.leaveUnsaved.title)
    await form.user.click(within(dialog).getByRole('button', { name: '移動する' }))

    expect(push).toHaveBeenCalledWith('/staff')
  })
})

describe('営業編集（SC-08 編集）', () => {
  it('今の値を入力欄に表示する。パスワードは空欄で必須ではなく、「変更する場合のみ」と表示する', () => {
    const form = renderForm(YAMADA)

    expect(form.name()).toHaveValue('山田太郎')
    expect(form.email()).toHaveValue('yamada@example.com')
    expect(screen.getByLabelText('パスワード')).toHaveValue('')
    expect(screen.getByText(/変更する場合のみ入力してください/)).toBeInTheDocument()
    expect(form.department()).toHaveValue('営業1課')
    expect(screen.getByRole('radio', { name: '営業' })).toBeChecked()
    expect(form.manager()).toHaveTextContent('鈴木一郎')
    expect(screen.getByRole('radio', { name: '有効' })).toBeChecked()
  })

  it('パスワードを空欄のまま保存すると、S-04 でパスワードを送らずに全項目を送る', async () => {
    put.mockResolvedValue({ data: { id: 2 } })
    const form = renderForm(YAMADA)

    await form.user.clear(form.department())
    await form.user.click(form.save())

    expect(put).toHaveBeenCalledWith('/sales-staff/2', {
      name: '山田太郎',
      email: 'yamada@example.com',
      department: null,
      role: 'sales',
      manager_id: 1,
      is_active: true,
    })
    expect(notifySuccess).toHaveBeenCalledWith('saved')
    expect(push).toHaveBeenCalledWith('/staff')
  })

  it('パスワードを入力したら、パスワードも送る', async () => {
    put.mockResolvedValue({ data: { id: 2 } })
    const form = renderForm(YAMADA)

    await form.user.type(screen.getByLabelText('パスワード'), 'NewPassw0rd')
    await form.user.click(form.save())

    expect(put).toHaveBeenCalledWith('/sales-staff/2', expect.objectContaining({ password: 'NewPassw0rd' }))
  })

  it('今の上長が無効になっていても、「（無効）」付きで選ばれたまま保存できる', async () => {
    put.mockResolvedValue({ data: { id: 5 } })
    const form = renderForm({ ...YAMADA, id: 5, manager: { id: 4, name: '田中次郎' } }, { managerOptions: [{ id: 1, name: '鈴木一郎' }] })

    expect(form.manager()).toHaveTextContent('田中次郎（無効）')
    await form.user.click(form.save())

    expect(put).toHaveBeenCalledWith('/sales-staff/5', expect.objectContaining({ manager_id: 4 }))
  })

  it('T-UI-24: 部下がいる上長を無効にして保存すると M-11 を出し、「無効にする」で保存する', async () => {
    put.mockResolvedValue({ data: { id: 1 } })
    const form = renderForm(SUZUKI, { managerOptions: [{ id: 4, name: '田中次郎' }] })

    await form.user.click(screen.getByRole('radio', { name: '無効' }))
    await form.user.click(form.save())

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.deactivateManager.title)
    expect(put).not.toHaveBeenCalled()
    await form.user.click(within(dialog).getByRole('button', { name: CONFIRM_MESSAGES.deactivateManager.confirmLabel }))

    await vi.waitFor(() => expect(put).toHaveBeenCalledWith('/sales-staff/1', expect.objectContaining({ is_active: false })))
    expect(push).toHaveBeenCalledWith('/staff')
  })

  it('M-11 で「キャンセル」を選ぶと保存せず、画面に留まる', async () => {
    const form = renderForm(SUZUKI)

    await form.user.click(screen.getByRole('radio', { name: '無効' }))
    await form.user.click(form.save())
    const dialog = await screen.findByRole('alertdialog')
    await form.user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

    expect(put).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(form.save()).toBeEnabled()
  })

  it('部下がいない人を無効にするときは、M-11 を出さずに保存する', async () => {
    put.mockResolvedValue({ data: { id: 2 } })
    const form = renderForm(YAMADA)

    await form.user.click(screen.getByRole('radio', { name: '無効' }))
    await form.user.click(form.save())

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(put).toHaveBeenCalledWith('/sales-staff/2', expect.objectContaining({ is_active: false }))
  })

  it('権限変更の 409（部下がいる上長）は、トーストでエラーを出す', async () => {
    put.mockRejectedValue(new ApiClientError(409, 'CONFLICT', 'この担当者には部下がいるため、権限を「上長」以外に変更できません'))
    const form = renderForm(SUZUKI)

    await form.user.click(screen.getByRole('radio', { name: '営業' }))
    await form.user.click(form.save())

    await vi.waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('この担当者には部下がいるため、権限を「上長」以外に変更できません'),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('ログイン中の管理者自身を編集するときは、権限と状態を変えられない', () => {
    renderForm({ ...YAMADA, id: 6, role: 'admin', manager: null }, { isSelf: true })

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled()
    }
    expect(screen.getByText('自分自身の権限は変更できません')).toBeInTheDocument()
    expect(screen.getByText('自分自身を無効にすることはできません')).toBeInTheDocument()
  })
})
