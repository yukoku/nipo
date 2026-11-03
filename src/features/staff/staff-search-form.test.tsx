import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StaffSearchForm, type StaffSearchValues } from './staff-search-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const DEPARTMENTS = ['営業1課', '営業2課']
const EMPTY: StaffSearchValues = { name: '', department: null, includeInactive: false }

function renderForm(initialValues: StaffSearchValues = EMPTY) {
  render(<StaffSearchForm initialValues={initialValues} departments={DEPARTMENTS} />)
  return userEvent.setup()
}

describe('営業一覧の検索条件（SC-07）', () => {
  it('氏名・部署・無効も表示で検索すると、条件を URL のクエリに入れて 1 ページ目を表示する', async () => {
    const user = renderForm()

    await user.type(screen.getByRole('textbox', { name: '氏名' }), ' 山田 ')
    await user.click(screen.getByRole('combobox', { name: '部署' }))
    await user.click(await screen.findByRole('option', { name: '営業2課' }))
    await user.click(screen.getByRole('checkbox', { name: '無効も表示' }))
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith(
      `/staff?name=${encodeURIComponent('山田')}&department=${encodeURIComponent('営業2課')}&include_inactive=true`,
    )
  })

  it('条件がなければ、クエリなしで表示する', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/staff')
  })

  it('今の検索条件を入力欄に表示し、部署を「全て」に戻せる', async () => {
    const user = renderForm({ name: '鈴木', department: '営業1課', includeInactive: true })

    expect(screen.getByRole('textbox', { name: '氏名' })).toHaveValue('鈴木')
    expect(screen.getByRole('combobox', { name: '部署' })).toHaveTextContent('営業1課')
    expect(screen.getByRole('checkbox', { name: '無効も表示' })).toBeChecked()

    await user.click(screen.getByRole('combobox', { name: '部署' }))
    await user.click(await screen.findByRole('option', { name: '全て' }))
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith(`/staff?name=${encodeURIComponent('鈴木')}&include_inactive=true`)
  })

  it('URL で指定された部署が選択肢になくても、選ばれたまま表示する', () => {
    renderForm({ name: '', department: '旧部署', includeInactive: false })

    expect(screen.getByRole('combobox', { name: '部署' })).toHaveTextContent('旧部署')
  })

  it('Enter キーでも検索できる', async () => {
    const user = renderForm()

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '佐藤{Enter}')

    expect(push).toHaveBeenCalledWith(`/staff?name=${encodeURIComponent('佐藤')}`)
  })
})
