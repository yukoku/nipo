import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DATE_RANGE_ORDER_MESSAGE } from '@/schemas/report'

import { ReportSearchForm, type ReportSearchValues } from './report-search-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const MANAGER_OPTIONS = [
  { id: 1, name: '自分' },
  { id: 2, name: '山田太郎' },
  { id: 3, name: '佐藤花子' },
]
const DEFAULTS: ReportSearchValues = { dateFrom: '2026-10-01', dateTo: '2026-10-31', salesStaffId: null, customerName: '' }

function renderForm(initialValues: ReportSearchValues = DEFAULTS, staffOptions?: { id: number; name: string }[]) {
  render(<ReportSearchForm initialValues={initialValues} staffOptions={staffOptions} />)
  return userEvent.setup()
}

/** 日付の入力欄は userEvent で打ち込めないため、値を直接変える */
const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('日報一覧の検索条件（SC-02）', () => {
  it('期間・顧客名の今の値を入力欄に表示する', () => {
    renderForm({ ...DEFAULTS, customerName: 'ABC' })

    expect(screen.getByLabelText('期間（開始）')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('期間（終了）')).toHaveValue('2026-10-31')
    expect(screen.getByRole('textbox', { name: '顧客' })).toHaveValue('ABC')
  })

  it('T-UI-04: 営業には担当者のセレクトを出さない', () => {
    renderForm()

    expect(screen.queryByRole('combobox', { name: '担当者' })).not.toBeInTheDocument()
  })

  it('T-UI-04: 上長には担当者のセレクトを出し、選択肢は「全員・自分・山田・佐藤」', async () => {
    const user = renderForm(DEFAULTS, MANAGER_OPTIONS)

    await user.click(screen.getByRole('combobox', { name: '担当者' }))

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '全員',
      '自分',
      '山田太郎',
      '佐藤花子',
    ])
  })

  it('T-UI-06: 条件を入れて検索すると、条件を URL のクエリに入れて 1 ページ目を表示する', async () => {
    const user = renderForm(DEFAULTS, MANAGER_OPTIONS)

    setDate('期間（開始）', '2026-10-29')
    setDate('期間（終了）', '2026-10-30')
    await user.click(screen.getByRole('combobox', { name: '担当者' }))
    await user.click(await screen.findByRole('option', { name: '山田太郎' }))
    await user.type(screen.getByRole('textbox', { name: '顧客' }), ' ABC ')
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/reports?date_from=2026-10-29&date_to=2026-10-30&sales_staff_id=2&customer_name=ABC')
  })

  it('担当者を選んだ状態で開き、「全員」に戻して検索できる', async () => {
    const user = renderForm({ ...DEFAULTS, salesStaffId: 3 }, MANAGER_OPTIONS)

    expect(screen.getByRole('combobox', { name: '担当者' })).toHaveTextContent('佐藤花子')
    await user.click(screen.getByRole('combobox', { name: '担当者' }))
    await user.click(await screen.findByRole('option', { name: '全員' }))
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(push).toHaveBeenCalledWith('/reports?date_from=2026-10-01&date_to=2026-10-31')
  })

  it('期間（終了）が期間（開始）より前なら、エラーを出して検索しない', async () => {
    const user = renderForm()

    setDate('期間（開始）', '2026-10-30')
    setDate('期間（終了）', '2026-10-29')
    await user.click(screen.getByRole('button', { name: '検索' }))

    expect(screen.getByRole('alert')).toHaveTextContent(DATE_RANGE_ORDER_MESSAGE)
    expect(screen.getByLabelText('期間（終了）')).toHaveAttribute('aria-invalid', 'true')
    expect(push).not.toHaveBeenCalled()
  })

  it('Enter キーでも検索できる', async () => {
    const user = renderForm()

    await user.type(screen.getByRole('textbox', { name: '顧客' }), '工業{Enter}')

    expect(push).toHaveBeenCalledWith(`/reports?date_from=2026-10-01&date_to=2026-10-31&customer_name=${encodeURIComponent('工業')}`)
  })
})
