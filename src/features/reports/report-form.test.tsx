import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'
import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { CONFIRM_MESSAGES } from '@/lib/messages'

import { ReportForm, type ReportFormReport } from './report-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

const post = vi.fn()
const put = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof apiClient>()),
  api: {
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
  },
}))

const notifySuccess = vi.fn()
const notifyError = vi.fn()
vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifySuccess(...args),
  notifyError: (...args: unknown[]) => notifyError(...args),
}))

const TODAY = '2026-10-31'

const DRAFT: ReportFormReport = {
  id: 102,
  reportDate: '2026-10-28',
  status: 'draft',
  problem: null,
  plan: null,
  visitRecords: [
    {
      id: 503,
      customer_id: 11,
      customerName: 'XYZ工業',
      visited_at: '15:00',
      content: '見積の説明',
    },
  ],
}

const SUBMITTED: ReportFormReport = {
  id: 101,
  reportDate: '2026-10-30',
  status: 'submitted',
  problem: '値引きの相談',
  plan: '資料送付',
  visitRecords: [],
}

function renderForm(report?: ReportFormReport) {
  render(
    <AppProviders>
      <ReportForm report={report} today={TODAY} />
    </AppProviders>,
  )
  const user = userEvent.setup()
  return {
    user,
    reportDate: () => screen.getByLabelText(/報告日/),
    problem: () => screen.getByRole('textbox', { name: /Problem/ }),
    plan: () => screen.getByRole('textbox', { name: /Plan/ }),
    button: (name: string) => screen.getByRole('button', { name }),
  }
}

describe('日報作成（SC-03 新規）', () => {
  it('報告日の初期値は今日で、未来日は選べない。ボタンはキャンセル・下書き保存・提出する', () => {
    const form = renderForm()

    expect(form.reportDate()).toHaveValue(TODAY)
    expect(form.reportDate()).toHaveAttribute('max', TODAY)
    expect(form.reportDate()).toBeEnabled()
    for (const name of ['キャンセル', '下書き保存', '提出する']) {
      expect(form.button(name)).toBeInTheDocument()
    }
    expect(screen.getByText('訪問記録はありません')).toBeInTheDocument()
  })

  it('下書き保存は Problem・Plan が空でも保存でき、確認なしで送って日報詳細へ移る', async () => {
    post.mockResolvedValue({ data: { id: 130 } })
    const form = renderForm()

    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/reports/130'))
    expect(post).toHaveBeenCalledWith('/reports', {
      report_date: TODAY,
      status: 'draft',
      problem: null,
      plan: null,
      visit_records: [],
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(notifySuccess).toHaveBeenCalledWith('saved')
  })

  it('T-UI-13: 提出時に Problem・Plan が空なら、各項目の下にエラーを出し、入力内容は消えない', async () => {
    const form = renderForm()
    await form.user.type(form.plan(), '資料送付')
    await form.user.clear(form.plan())
    await form.user.type(form.problem(), '   ')

    await form.user.click(form.button('提出する'))

    expect(await screen.findByText('Problemは必須です')).toBeInTheDocument()
    expect(screen.getByText('Planは必須です')).toBeInTheDocument()
    expect(form.problem()).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('T-UI-14: 「提出する」で確認ダイアログ（M-06）を出し、キャンセルすると何も送らない', async () => {
    const form = renderForm()
    await form.user.type(form.problem(), '値引きの相談')
    await form.user.type(form.plan(), '資料送付')

    await form.user.click(form.button('提出する'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.submitReport.title)
    await form.user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(form.problem()).toHaveValue('値引きの相談')
    expect(form.button('提出する')).toBeEnabled()
  })

  it('確認ダイアログで「提出する」を選ぶと、提出として送り「提出しました」を出す', async () => {
    post.mockResolvedValue({ data: { id: 131 } })
    const form = renderForm()
    await form.user.type(form.problem(), '値引きの相談')
    await form.user.type(form.plan(), '資料送付')

    await form.user.click(form.button('提出する'))
    await form.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: '提出する',
      }),
    )

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/reports/131'))
    expect(post).toHaveBeenCalledWith(
      '/reports',
      expect.objectContaining({ status: 'submitted', problem: '値引きの相談' }),
    )
    expect(notifySuccess).toHaveBeenCalledWith('submitted')
  })

  it('同じ日付の日報がある（409）ときは、M-04 を報告日の下に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(409, 'CONFLICT', 'この日付の日報は既に作成されています', 'REPORT_ALREADY_EXISTS'),
    )
    const form = renderForm()

    await form.user.click(form.button('下書き保存'))

    expect(await screen.findByText('この日付の日報は既に作成されています')).toBeInTheDocument()
    expect(form.reportDate()).toHaveAttribute('aria-invalid', 'true')
    expect(notifyError).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('API の入力エラー（400）は該当する項目の下に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        {
          field: 'report_date',
          message: '報告日に未来の日付は指定できません',
        },
      ]),
    )
    const form = renderForm()

    await form.user.click(form.button('下書き保存'))

    expect(await screen.findByText('報告日に未来の日付は指定できません')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('項目に結び付けられないエラー（500 など）はトーストで出す', async () => {
    post.mockRejectedValue(new ApiClientError(500, 'INTERNAL_ERROR', 'サーバーエラー'))
    const form = renderForm()

    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    expect(form.button('下書き保存')).toBeEnabled()
  })

  it('T-UI-15: 入力途中でキャンセルすると M-07 を出し、「入力を続ける」なら留まり、「移動する」なら日報一覧へ戻る', async () => {
    const form = renderForm()
    await form.user.type(form.problem(), '途中')

    await form.user.click(form.button('キャンセル'))
    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.leaveUnsaved.title)
    await form.user.click(within(dialog).getByRole('button', { name: '入力を続ける' }))
    expect(push).not.toHaveBeenCalled()

    await form.user.click(form.button('キャンセル'))
    dialog = await screen.findByRole('alertdialog')
    await form.user.click(within(dialog).getByRole('button', { name: '移動する' }))
    expect(push).toHaveBeenCalledWith('/reports')
  })

  it('何も入力していなければ、キャンセルは確認せずに日報一覧へ戻る', async () => {
    const form = renderForm()

    await form.user.click(form.button('キャンセル'))

    expect(push).toHaveBeenCalledWith('/reports')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('日報編集（SC-03 編集）', () => {
  it('T-UI-16: 報告日は入力できない', () => {
    const form = renderForm(DRAFT)

    expect(form.reportDate()).toHaveValue(DRAFT.reportDate)
    expect(form.reportDate()).toBeDisabled()
    expect(screen.getByText('報告日は変更できません')).toBeInTheDocument()
  })

  it('下書きの編集では、既存の訪問記録を表示し、保存すると訪問記録を送り返す（報告日は送らない）', async () => {
    put.mockResolvedValue({ data: { id: DRAFT.id } })
    const form = renderForm(DRAFT)
    const visits = screen.getByRole('list', { name: '訪問記録' })
    expect(visits).toHaveTextContent('XYZ工業')
    expect(visits).toHaveTextContent('15:00')

    await form.user.type(form.problem(), '追記')
    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/reports/${DRAFT.id}`))
    expect(put).toHaveBeenCalledWith(`/reports/${DRAFT.id}`, {
      status: 'draft',
      problem: '追記',
      plan: null,
      visit_records: [
        {
          id: 503,
          customer_id: 11,
          visited_at: '15:00',
          content: '見積の説明',
        },
      ],
    })
    expect(notifySuccess).toHaveBeenCalledWith('saved')
  })

  it('下書きを提出すると M-06 で確かめてから提出する', async () => {
    put.mockResolvedValue({ data: { id: DRAFT.id } })
    const form = renderForm(DRAFT)
    await form.user.type(form.problem(), '相談')
    await form.user.type(form.plan(), '予定')

    await form.user.click(form.button('提出する'))
    await form.user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: '提出する',
      }),
    )

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('submitted'))
    expect(put).toHaveBeenCalledWith(`/reports/${DRAFT.id}`, expect.objectContaining({ status: 'submitted' }))
  })

  it('提出済みの日報では、ボタンは「更新する」だけで、確認なしに提出済みのまま保存する', async () => {
    put.mockResolvedValue({ data: { id: SUBMITTED.id } })
    const form = renderForm(SUBMITTED)
    expect(screen.queryByRole('button', { name: '下書き保存' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提出する' })).not.toBeInTheDocument()

    await form.user.type(form.plan(), '、アポ取り')
    await form.user.click(form.button('更新する'))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/reports/${SUBMITTED.id}`))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(put).toHaveBeenCalledWith(
      `/reports/${SUBMITTED.id}`,
      expect.objectContaining({
        status: 'submitted',
        plan: '資料送付、アポ取り',
      }),
    )
    expect(notifySuccess).toHaveBeenCalledWith('saved')
  })

  it('コメントが付いて編集できなくなっていた（409）ときは、トーストで知らせる', async () => {
    put.mockRejectedValue(
      new ApiClientError(409, 'CONFLICT', 'コメントが付いているため編集できません', 'REPORT_LOCKED'),
    )
    const form = renderForm(SUBMITTED)

    await form.user.click(form.button('更新する'))

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('コメントが付いているため編集できません'))
    expect(push).not.toHaveBeenCalled()
  })

  it('キャンセルすると日報詳細へ戻る', async () => {
    const form = renderForm(DRAFT)

    await form.user.click(form.button('キャンセル'))

    expect(push).toHaveBeenCalledWith(`/reports/${DRAFT.id}`)
  })
})
