import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StaffList, type StaffListItem } from './staff-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const STAFF: StaffListItem[] = [
  {
    id: 2,
    name: '山田太郎',
    email: 'yamada@example.com',
    department: '営業1課',
    role: 'sales',
    manager: { id: 1, name: '鈴木一郎' },
    isActive: true,
  },
  { id: 6, name: '管理者', email: 'admin@example.com', department: null, role: 'admin', manager: null, isActive: false },
]

describe('営業一覧の一覧部分（SC-07）', () => {
  it('表に氏名・メールアドレス・部署・権限・上長・状態を表示する（未設定は「-」）', () => {
    render(<StaffList staff={STAFF} />)
    const table = screen.getByRole('table', { name: '営業担当者の一覧' })

    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '氏名',
      'メールアドレス',
      '部署',
      '権限',
      '上長',
      '状態',
    ])
    const [, yamada, admin] = within(table).getAllByRole('row')
    expect(within(yamada!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '山田太郎',
      'yamada@example.com',
      '営業1課',
      '営業',
      '鈴木一郎',
      '有効',
    ])
    expect(within(admin!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '管理者',
      'admin@example.com',
      '-',
      '管理者',
      '-',
      '無効',
    ])
  })

  it('氏名は編集画面（SC-08）へのリンクになっている', () => {
    render(<StaffList staff={STAFF} />)
    const table = screen.getByRole('table', { name: '営業担当者の一覧' })

    expect(within(table).getByRole('link', { name: '山田太郎' })).toHaveAttribute('href', '/staff/2')
  })

  it('行のどこをクリックしても、編集画面へ移る', async () => {
    const user = userEvent.setup()
    render(<StaffList staff={STAFF} />)

    await user.click(within(screen.getByRole('table')).getByText('yamada@example.com'))

    expect(push).toHaveBeenCalledWith('/staff/2')
  })

  it('スマートフォン幅用のカードにも同じ担当者を表示し、カード全体が編集画面へのリンクになっている', () => {
    render(<StaffList staff={STAFF} />)
    const cards = within(screen.getByRole('list', { name: '営業担当者の一覧' })).getAllByRole('link')

    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAttribute('href', '/staff/2')
    expect(cards[0]).toHaveTextContent('山田太郎')
    expect(cards[0]).toHaveTextContent('鈴木一郎')
  })

  it('該当する担当者がいなければ、その旨を表示する', () => {
    render(<StaffList staff={[]} />)

    expect(screen.getByText('該当する営業担当者はいません')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
