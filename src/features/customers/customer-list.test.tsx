import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CustomerList, type CustomerListItem } from './customer-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const CUSTOMERS: CustomerListItem[] = [
  { id: 10, name: 'ABC商事', contactPerson: '田中様', phone: '03-1234-5678', assignedSales: { id: 2, name: '山田太郎' }, isActive: true },
  { id: 13, name: '旧取引先', contactPerson: null, phone: null, assignedSales: null, isActive: false },
]

describe('顧客一覧の一覧部分（SC-05）', () => {
  it('表に顧客名・先方担当者・電話番号・担当営業・状態を表示する（未設定は「-」）', () => {
    render(<CustomerList customers={CUSTOMERS} />)
    const table = screen.getByRole('table', { name: '顧客の一覧' })

    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '顧客名',
      '先方担当者',
      '電話番号',
      '担当営業',
      '状態',
    ])
    const [, abc, old] = within(table).getAllByRole('row')
    expect(within(abc!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'ABC商事',
      '田中様',
      '03-1234-5678',
      '山田太郎',
      '有効',
    ])
    expect(within(old!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['旧取引先', '-', '-', '-', '無効'])
  })

  it('顧客名は編集画面（SC-06）へのリンクになっている', () => {
    render(<CustomerList customers={CUSTOMERS} />)
    const table = screen.getByRole('table', { name: '顧客の一覧' })

    expect(within(table).getByRole('link', { name: 'ABC商事' })).toHaveAttribute('href', '/customers/10')
  })

  it('行のどこをクリックしても、編集画面へ移る', async () => {
    const user = userEvent.setup()
    render(<CustomerList customers={CUSTOMERS} />)

    await user.click(within(screen.getByRole('table')).getByText('03-1234-5678'))

    expect(push).toHaveBeenCalledWith('/customers/10')
  })

  it('スマートフォン幅用のカードにも同じ顧客を表示し、カード全体が編集画面へのリンクになっている', () => {
    render(<CustomerList customers={CUSTOMERS} />)
    const cards = within(screen.getByRole('list', { name: '顧客の一覧' })).getAllByRole('link')

    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('href', '/customers/10')
    expect(cards[0]).toHaveTextContent('ABC商事')
    expect(cards[0]).toHaveTextContent('山田太郎')
  })

  it('該当する顧客がなければ、その旨を表示する', () => {
    render(<CustomerList customers={[]} />)

    expect(screen.getByText('該当する顧客はありません')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
