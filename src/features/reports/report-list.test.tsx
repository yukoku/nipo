import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReportList, type ReportListItem } from './report-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const YAMADA = { id: 2, name: '山田太郎' }
const ABC = { id: 10, name: 'ABC商事' }
const XYZ = { id: 11, name: 'XYZ工業' }
const DEF = { id: 12, name: 'DEF物産' }
const SATO = { id: 3, name: '佐藤花子' }

const REPORTS: ReportListItem[] = [
  { id: 103, reportDate: '2026-10-30', salesStaff: SATO, status: 'submitted', visitCount: 1, customers: [DEF], commentCount: 0, needsComment: true },
  { id: 101, reportDate: '2026-10-30', salesStaff: YAMADA, status: 'submitted', visitCount: 1, customers: [XYZ], commentCount: 0, needsComment: true },
  { id: 100, reportDate: '2026-10-29', salesStaff: YAMADA, status: 'submitted', visitCount: 2, customers: [ABC, XYZ], commentCount: 1, needsComment: false },
  { id: 102, reportDate: '2026-10-28', salesStaff: YAMADA, status: 'draft', visitCount: 0, customers: [], commentCount: 0, needsComment: false },
]

describe('日報一覧の一覧部分（SC-02）', () => {
  it('表に日付（YYYY/MM/DD（曜））・担当者・顧客・訪問件数・ステータス・コメント件数を表示する。下書きのコメントは「-」', () => {
    render(<ReportList reports={REPORTS} />)
    const table = screen.getByRole('table', { name: '日報の一覧' })

    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '日付',
      '担当者',
      '顧客',
      '訪問件数',
      'ステータス',
      'コメント',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[2]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '2026/10/29（木）',
      '山田太郎',
      'ABC商事、XYZ工業',
      '2',
      '提出済み',
      '1 件',
    ])
    expect(within(rows[3]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '2026/10/28（水）',
      '山田太郎',
      '-',
      '0',
      '下書き',
      '-',
    ])
  })

  it('T-UI-05: 上長から見てコメントがまだない日報（101・103）に「●」を付け、100 には付けない', () => {
    render(<ReportList reports={REPORTS} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)

    expect(within(rows[0]!).getByRole('img', { name: '未コメント' })).toHaveTextContent('●')
    expect(within(rows[1]!).getByRole('img', { name: '未コメント' })).toBeInTheDocument()
    expect(within(rows[2]!).queryByRole('img', { name: '未コメント' })).not.toBeInTheDocument()
  })

  it('日付は日報詳細（SC-04）へのリンク。行のどこをクリックしても詳細へ移る', async () => {
    const user = userEvent.setup()
    render(<ReportList reports={REPORTS} />)
    const table = screen.getByRole('table')

    expect(within(table).getByRole('link', { name: '2026/10/29（木）' })).toHaveAttribute('href', '/reports/100')
    await user.click(within(table).getByText('佐藤花子'))
    expect(push).toHaveBeenCalledWith('/reports/103')
  })

  it('T-UI-25: スマートフォン幅用のカードにも同じ日報を表示し、カード全体が詳細へのリンクになっている', () => {
    render(<ReportList reports={REPORTS} />)
    const cards = within(screen.getByRole('list', { name: '日報の一覧' })).getAllByRole('link')

    expect(cards).toHaveLength(4)
    expect(cards[0]).toHaveAttribute('href', '/reports/103')
    expect(cards[0]).toHaveTextContent('佐藤花子')
    expect(cards[0]).toHaveTextContent('DEF物産')
    expect(within(cards[0]!).getByRole('img', { name: '未コメント' })).toBeInTheDocument()
  })

  it('行のリンクに、今の検索条件を引き継ぐ（詳細の「一覧へ戻る」で同じ一覧に戻すため。T-UI-06）', () => {
    render(<ReportList reports={REPORTS} listQuery="?customer_name=ABC&page=2" />)

    const table = screen.getByRole('table', { name: '日報の一覧' })
    expect(within(table).getByRole('link', { name: '2026/10/29（木）' })).toHaveAttribute(
      'href',
      '/reports/100?list=customer_name%3DABC%26page%3D2',
    )
  })

  it('該当する日報がなければ、その旨を表示する', () => {
    render(<ReportList reports={[]} />)

    expect(screen.getByText('該当する日報はありません')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
