import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CustomerSearchForm, type CustomerSearchValues } from './customer-search-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const STAFF = [
  { id: 3, name: '佐藤花子' },
  { id: 2, name: '山田太郎' },
]
const EMPTY: CustomerSearchValues = { name: '', assignedSalesId: null, includeInactive: false }

function renderForm(initialValues: CustomerSearchValues = EMPTY) {
  render(<CustomerSearchForm initialValues={initialValues} staffOptions={STAFF} />)
  return userEvent.setup()
}

describe('顧客一覧の検索条件（SC-05）', () => {
  it('顧客名・担当営業・無効も表示で検索すると、条件を URL のクエリに入れて 1 ページ目を表示する', async () => {
    const user = renderForm()

    await user.type(screen.getByRole('textbox', { name: '顧客名' }), ' 商事 ')
    await user.click(screen.getByRole('combobox', { name: '担当営業' }))
    await user.click(await screen.findByRole('option', { name: '山田太郎' }))
    await user.click(screen.getByRole('checkbox', { name: '無効も表示' }))
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/customers?name=%E5%95%86%E4%BA%8B&assigned_sales_id=2&include_inactive=true')
  })

  it('条件がなければ、クエリなしで表示する', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/customers')
  })

  it('今の検索条件を入力欄に表示し、「全員」に戻せる', async () => {
    const user = renderForm({ name: 'ABC', assignedSalesId: 3, includeInactive: true })

    expect(screen.getByRole('textbox', { name: '顧客名' })).toHaveValue('ABC')
    expect(screen.getByRole('combobox', { name: '担当営業' })).toHaveTextContent('佐藤花子')
    expect(screen.getByRole('checkbox', { name: '無効も表示' })).toBeChecked()

    await user.click(screen.getByRole('combobox', { name: '担当営業' }))
    await user.click(await screen.findByRole('option', { name: '全員' }))
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/customers?name=ABC&include_inactive=true')
  })

  it('Enter キーでも検索できる', async () => {
    const user = renderForm()

    await user.type(screen.getByRole('textbox', { name: '顧客名' }), 'XYZ{Enter}')

    expect(push).toHaveBeenCalledWith('/customers?name=XYZ')
  })
})
