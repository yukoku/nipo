import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'
import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { CONFIRM_MESSAGES, ERROR_MESSAGES } from '@/lib/messages'

import { CustomerForm, type CustomerFormCustomer } from './customer-form'

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

const STAFF = [
  { id: 3, name: '佐藤花子' },
  { id: 2, name: '山田太郎' },
]

const ABC: CustomerFormCustomer = {
  id: 10,
  name: 'ABC商事',
  contactPerson: '田中様',
  phone: '03-1234-5678',
  address: '東京都千代田区丸の内1-1-1',
  assignedSales: { id: 2, name: '山田太郎' },
  isActive: true,
}

function renderForm(customer?: CustomerFormCustomer) {
  render(
    <AppProviders>
      <CustomerForm customer={customer} staffOptions={STAFF} />
    </AppProviders>,
  )
  const user = userEvent.setup()
  return {
    user,
    name: () => screen.getByRole('textbox', { name: /顧客名/ }),
    phone: () => screen.getByRole('textbox', { name: /電話番号/ }),
    assignedSales: () => screen.getByRole('combobox', { name: '担当営業' }),
    save: () => screen.getByRole('button', { name: '保存' }),
    async selectStaff(name: string) {
      await user.click(screen.getByRole('combobox', { name: '担当営業' }))
      await user.click(await screen.findByRole('option', { name }))
    },
  }
}

describe('顧客登録（SC-06 新規）', () => {
  it('入力項目があり、顧客名だけが必須（*）。状態は表示しない', () => {
    renderForm()

    expect(screen.getByLabelText('顧客名*（必須）')).toHaveValue('')
    for (const label of ['先方担当者', '電話番号', '住所']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveValue('')
    }
    expect(screen.getByRole('combobox', { name: '担当営業' })).toHaveTextContent('未設定')
    expect(screen.queryByRole('radiogroup', { name: '状態' })).not.toBeInTheDocument()
  })

  it('担当営業の選択肢は「未設定」と有効な営業', async () => {
    const form = renderForm()

    await form.user.click(form.assignedSales())

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '未設定',
      '佐藤花子',
      '山田太郎',
    ])
  })

  it('入力して保存すると、M-02 で登録し、M-09 を出して顧客一覧へ戻る（状態は送らない）', async () => {
    post.mockResolvedValue({ data: { id: 20 } })
    const form = renderForm()

    await form.user.type(form.name(), ' GHI商会 ')
    await form.user.type(screen.getByRole('textbox', { name: '先方担当者' }), '佐々木様')
    await form.user.type(form.phone(), '045-123-4567')
    await form.selectStaff('佐藤花子')
    await form.user.click(form.save())

    expect(post).toHaveBeenCalledWith('/customers', {
      name: 'GHI商会',
      contact_person: '佐々木様',
      phone: '045-123-4567',
      address: null,
      assigned_sales_id: 3,
    })
    expect(notifySuccess).toHaveBeenCalledWith('saved')
    expect(push).toHaveBeenCalledWith('/customers')
  })

  it('顧客名が空なら、項目の下に必須エラーが出て API は呼ばない（M-02）', async () => {
    const form = renderForm()

    await form.user.click(form.save())

    expect(await screen.findByText('顧客名は必須です')).toBeInTheDocument()
    expect(form.name()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it.each(['03(1234)5678', '--1-', '03-12345678'])('電話番号が %s なら形式エラー', async (phone) => {
    const form = renderForm()

    await form.user.type(form.name(), 'GHI商会')
    await form.user.type(form.phone(), phone)
    await form.user.click(form.save())

    expect(await screen.findByText('電話番号の形式が正しくありません（例：03-1234-5678）')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('入力欄の最大文字数は API の上限と同じ（M-03）', () => {
    renderForm()

    expect(screen.getByLabelText('顧客名*（必須）')).toHaveAttribute('maxLength', '100')
    expect(screen.getByRole('textbox', { name: '先方担当者' })).toHaveAttribute('maxLength', '50')
    expect(screen.getByRole('textbox', { name: /電話番号/ })).toHaveAttribute('maxLength', '20')
    expect(screen.getByRole('textbox', { name: '住所' })).toHaveAttribute('maxLength', '200')
  })

  it('API が 400 を返したら、該当する項目の下にエラーを出し、画面に留まる', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'assigned_sales_id', message: '担当営業には有効な営業担当者を指定してください' },
      ]),
    )
    const form = renderForm()

    await form.user.type(form.name(), 'GHI商会')
    await form.selectStaff('山田太郎')
    await form.user.click(form.save())

    expect(await screen.findByText('担当営業には有効な営業担当者を指定してください')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(form.save()).toBeEnabled()
  })

  it('API が 400 以外のエラーなら、トーストでエラーを出す', async () => {
    post.mockRejectedValue(new ApiClientError(500, 'INTERNAL_ERROR', 'サーバーでエラーが発生しました'))
    const form = renderForm()

    await form.user.type(form.name(), 'GHI商会')
    await form.user.click(form.save())

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith(ERROR_MESSAGES.unexpected))
    expect(push).not.toHaveBeenCalled()
  })

  it('入力していなければ、キャンセルで確認なしに顧客一覧へ戻る', async () => {
    const form = renderForm()

    await form.user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/customers')
  })

  it('入力途中でキャンセルすると M-07 を出し、「入力を続ける」なら留まり、「移動する」なら顧客一覧へ戻る', async () => {
    const form = renderForm()
    await form.user.type(form.name(), 'GHI商会')

    await form.user.click(screen.getByRole('button', { name: 'キャンセル' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.leaveUnsaved.title)
    await form.user.click(within(dialog).getByRole('button', { name: '入力を続ける' }))
    expect(push).not.toHaveBeenCalled()
    expect(form.name()).toHaveValue('GHI商会')

    await form.user.click(screen.getByRole('button', { name: 'キャンセル' }))
    await form.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '移動する' }))
    expect(push).toHaveBeenCalledWith('/customers')
  })
})

describe('顧客編集（SC-06 編集）', () => {
  it('今の値を入力欄に表示し、状態のラジオボタンを出す', () => {
    renderForm(ABC)

    expect(screen.getByLabelText('顧客名*（必須）')).toHaveValue('ABC商事')
    expect(screen.getByRole('textbox', { name: '先方担当者' })).toHaveValue('田中様')
    expect(screen.getByRole('textbox', { name: /電話番号/ })).toHaveValue('03-1234-5678')
    expect(screen.getByRole('textbox', { name: '住所' })).toHaveValue('東京都千代田区丸の内1-1-1')
    expect(screen.getByRole('combobox', { name: '担当営業' })).toHaveTextContent('山田太郎')
    expect(screen.getByRole('radio', { name: '有効' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '無効' })).not.toBeChecked()
  })

  it('無効にして保存すると、M-04 で全項目を送る（空にした項目は null）', async () => {
    put.mockResolvedValue({ data: { id: 10 } })
    const form = renderForm(ABC)

    await form.user.clear(screen.getByRole('textbox', { name: '住所' }))
    await form.selectStaff('未設定')
    await form.user.click(screen.getByRole('radio', { name: '無効' }))
    await form.user.click(form.save())

    expect(put).toHaveBeenCalledWith('/customers/10', {
      name: 'ABC商事',
      contact_person: '田中様',
      phone: '03-1234-5678',
      address: null,
      assigned_sales_id: null,
      is_active: false,
    })
    expect(push).toHaveBeenCalledWith('/customers')
  })

  it('今の担当営業が無効になっていても、「（無効）」付きで選ばれたまま保存できる（決定事項 #30）', async () => {
    put.mockResolvedValue({ data: { id: 10 } })
    const form = renderForm({ ...ABC, assignedSales: { id: 7, name: '退職者' } })

    expect(form.assignedSales()).toHaveTextContent('退職者（無効）')
    await form.user.click(form.save())

    expect(put).toHaveBeenCalledWith('/customers/10', expect.objectContaining({ assigned_sales_id: 7 }))
  })

  it('未設定の項目は空欄で表示する', () => {
    renderForm({ ...ABC, contactPerson: null, phone: null, address: null, assignedSales: null, isActive: false })

    expect(screen.getByRole('textbox', { name: '先方担当者' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: '担当営業' })).toHaveTextContent('未設定')
    expect(screen.getByRole('radio', { name: '無効' })).toBeChecked()
  })
})
