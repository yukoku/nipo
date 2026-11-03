import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'

import { type ReportDetailReport, ReportDetail } from './report-detail'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))

const YAMADA_ID = 2
const SUZUKI_ID = 1

const SUBMITTED: ReportDetailReport = {
  id: 101,
  reportDate: '2026-10-30',
  salesStaff: { id: 2, name: '山田太郎' },
  status: 'submitted',
  submittedAt: new Date('2026-10-30T09:05:00Z'),
  problem: '値引きの相談\n2行目',
  plan: '資料送付',
  visitRecords: [
    {
      id: 501,
      customer: { id: 10, name: 'ABC商事' },
      visitedAt: '10:00',
      content: '新商品の提案。\n先方部長が興味あり',
    },
    { id: 502, customer: { id: 13, name: '旧取引先' }, visitedAt: null, content: '<script>alert(1)</script>' },
  ],
  comments: [
    {
      id: 801,
      target: 'problem',
      body: '5%までなら即決OK。\nそれ以上は相談して。',
      commenter: { id: SUZUKI_ID, name: '鈴木一郎' },
      createdAt: new Date('2026-10-30T10:10:00Z'),
      updatedAt: new Date('2026-10-30T10:10:00Z'),
    },
    {
      id: 802,
      target: 'plan',
      body: '資料は私にも送って',
      commenter: { id: SUZUKI_ID, name: '鈴木一郎' },
      createdAt: new Date('2026-10-30T10:20:00Z'),
      updatedAt: new Date('2026-10-30T10:20:00Z'),
    },
  ],
  permissions: { canEdit: true, canComment: false },
}

const DRAFT: ReportDetailReport = {
  ...SUBMITTED,
  id: 102,
  status: 'draft',
  submittedAt: null,
  problem: null,
  plan: null,
  visitRecords: [],
  comments: [],
}

function renderDetail(report: ReportDetailReport, listHref = '/reports', currentUserId = YAMADA_ID) {
  return render(
    <AppProviders>
      <ReportDetail report={report} listHref={listHref} currentUserId={currentUserId} />
    </AppProviders>,
  )
}

describe('日報詳細（SC-04）', () => {
  it('ヘッダーに報告日・担当者・ステータス・提出日時（JST）を出す', () => {
    renderDetail(SUBMITTED)

    expect(screen.getByText('2026/10/30（金）')).toBeInTheDocument()
    expect(screen.getByText('山田太郎')).toBeInTheDocument()
    expect(screen.getByText('提出済み')).toBeInTheDocument()
    expect(screen.getByText('提出日時')).toBeInTheDocument()
    expect(screen.getByText('2026/10/30 18:05')).toBeInTheDocument()
  })

  it('下書きは提出日時を出さず、未入力の Problem・Plan は「（未入力）」、訪問記録がなければその旨を出す', () => {
    renderDetail(DRAFT)

    expect(screen.getByText('下書き')).toBeInTheDocument()
    expect(screen.queryByText('提出日時')).not.toBeInTheDocument()
    expect(screen.getAllByText('（未入力）')).toHaveLength(2)
    expect(screen.getByText('訪問記録はありません')).toBeInTheDocument()
  })

  it('訪問記録を順に表示する。時刻が未入力なら「-」', () => {
    renderDetail(SUBMITTED)

    const rows = within(screen.getByRole('table', { name: '訪問記録' })).getAllByRole('row')
    expect(rows.slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['10:00', '-'])
    expect(within(rows[1] as HTMLElement).getByText('ABC商事')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('旧取引先')).toBeInTheDocument()
  })

  it('T-UI-20: 訪問内容・Problem の改行をそのまま表示する', () => {
    renderDetail(SUBMITTED)

    const problem = screen.getByRole('region', { name: 'Problem（課題・相談）' })
    expect(within(problem).getByText(/値引きの相談/).textContent).toBe('値引きの相談\n2行目')
    const table = screen.getByRole('table', { name: '訪問記録' })
    expect(within(table).getByText(/新商品の提案/).textContent).toBe('新商品の提案。\n先方部長が興味あり')
  })

  it('T-UI-21: 入力された HTML は文字列としてそのまま表示し、要素として解釈しない', () => {
    const { container } = renderDetail(SUBMITTED)

    expect(
      within(screen.getByRole('table', { name: '訪問記録' })).getByText('<script>alert(1)</script>'),
    ).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })

  it('T-UI-17: 編集できる日報には「編集」を出し、編集画面へのリンクにする', () => {
    renderDetail(SUBMITTED)

    expect(screen.getByRole('link', { name: '編集' })).toHaveAttribute('href', '/reports/101/edit')
  })

  it('T-UI-17: 編集できない日報（コメント付き・上長から見た部下の日報）には「編集」を出さない', () => {
    renderDetail({ ...SUBMITTED, permissions: { canEdit: false, canComment: false } })

    expect(screen.queryByRole('link', { name: '編集' })).not.toBeInTheDocument()
  })

  it('T-UI-06: 「一覧へ戻る」は、一覧から引き継いだ検索条件の一覧へのリンク', () => {
    renderDetail(SUBMITTED, '/reports?customer_name=ABC&page=2')

    expect(screen.getByRole('link', { name: '一覧へ戻る' })).toHaveAttribute(
      'href',
      '/reports?customer_name=ABC&page=2',
    )
  })

  it('T-UI-19: コメントを Problem・Plan それぞれのセクションの下に出す（改行はそのまま）', () => {
    renderDetail(SUBMITTED)

    const problem = screen.getByRole('region', { name: 'Problem（課題・相談）' })
    const plan = screen.getByRole('region', { name: 'Plan（明日やること）' })
    const problemComments = within(problem).getByRole('list', { name: 'Problem へのコメント' })
    expect(within(problemComments).getByText(/5%までなら即決OK/).textContent).toBe(
      '5%までなら即決OK。\nそれ以上は相談して。',
    )
    expect(within(problemComments).getByText('鈴木一郎')).toBeInTheDocument()
    expect(within(problemComments).getByText('2026/10/30 19:10')).toBeInTheDocument()
    expect(within(problem).queryByText('資料は私にも送って')).not.toBeInTheDocument()
    expect(within(plan).getByText('資料は私にも送って')).toBeInTheDocument()
  })

  it('コメントがないセクションには「コメントはまだありません」と出す', () => {
    renderDetail({ ...SUBMITTED, comments: [] })

    expect(screen.getAllByText('コメントはまだありません')).toHaveLength(2)
  })

  it('T-UI-18: コメントできる人（直属の上長）には、Problem・Plan それぞれに入力欄と「投稿」を出す', () => {
    renderDetail({ ...SUBMITTED, permissions: { canEdit: false, canComment: true } }, '/reports', SUZUKI_ID)

    expect(screen.getByRole('textbox', { name: /Problem へのコメント/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Plan へのコメント/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '投稿' })).toHaveLength(2)
  })

  it('T-UI-18: コメントできない人（日報を書いた本人）には、入力欄を出さない', () => {
    renderDetail(SUBMITTED)

    expect(screen.queryByRole('textbox', { name: /へのコメント/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '投稿' })).not.toBeInTheDocument()
  })
})
