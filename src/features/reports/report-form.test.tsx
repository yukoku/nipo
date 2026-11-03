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
      customerId: 11,
      customerName: 'XYZ工業',
      visitedAt: '15:00',
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

/** 有効な顧客（旧取引先は無効のため含まない） */
const CUSTOMERS = [
  { id: 10, name: 'ABC商事' },
  { id: 12, name: 'DEF物産' },
  { id: 11, name: 'XYZ工業' },
]

function renderForm(report?: ReportFormReport) {
  render(
    <AppProviders>
      <ReportForm report={report} today={TODAY} customerOptions={CUSTOMERS} />
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
    expect(screen.getByText(/訪問記録はありません/)).toBeInTheDocument()
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
    const row = screen.getByRole('listitem', { name: '訪問記録 1行目' })
    expect(within(row).getByRole('combobox', { name: /顧客/ })).toHaveTextContent('XYZ工業')
    expect(within(row).getByLabelText('時刻')).toHaveValue('15:00')
    expect(within(row).getByRole('textbox', { name: /訪問内容/ })).toHaveValue('見積の説明')

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

describe('訪問記録の入力（SC-03）', () => {
  function row(number: number) {
    return screen.getByRole('listitem', { name: `訪問記録 ${number}行目` })
  }

  async function fillRow(user: ReturnType<typeof userEvent.setup>, number: number, customer: string, content: string) {
    await user.click(within(row(number)).getByRole('combobox', { name: /顧客/ }))
    await user.click(await screen.findByRole('option', { name: customer }))
    await user.type(within(row(number)).getByRole('textbox', { name: /訪問内容/ }), content)
  }

  it('T-UI-09: 行を 3 つ追加して 2 行目を削除すると、1・3 行目の内容が順に送られる', async () => {
    post.mockResolvedValue({ data: { id: 140 } })
    const form = renderForm()
    for (let i = 0; i < 3; i++) {
      await form.user.click(form.button('訪問記録を追加'))
    }
    await fillRow(form.user, 1, 'ABC商事', '新商品の提案')
    await form.user.type(within(row(1)).getByLabelText('時刻'), '10:00')
    await fillRow(form.user, 2, 'DEF物産', '消す行')
    await fillRow(form.user, 3, 'XYZ工業', '見積提出')

    await form.user.click(within(row(2)).getByRole('button', { name: '2行目を削除' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      visit_records: [
        { customer_id: 10, visited_at: '10:00', content: '新商品の提案' },
        { customer_id: 11, visited_at: null, content: '見積提出' },
      ],
    })
  })

  it('T-UI-10: ハンドルをキーボードで操作して並べ替えると、並べ替えた順に送られる', async () => {
    put.mockResolvedValue({ data: { id: DRAFT.id } })
    const report: ReportFormReport = {
      ...DRAFT,
      visitRecords: [
        { id: 1, customerId: 10, customerName: 'ABC商事', visitedAt: null, content: '1件目' },
        { id: 2, customerId: 11, customerName: 'XYZ工業', visitedAt: null, content: '2件目' },
        { id: 3, customerId: 12, customerName: 'DEF物産', visitedAt: null, content: '3件目' },
      ],
    }
    // jsdom は要素の位置を計算しないため、行を上から 100px おきに並んでいることにする（並べ替えの移動先の判定に使う）
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const item = this.closest('li')
      const index = item === null ? 0 : Array.from(item.parentElement?.children ?? []).indexOf(item)
      const top = index * 100
      return { x: 0, y: top, top, left: 0, right: 500, bottom: top + 90, width: 500, height: 90, toJSON: () => ({}) }
    })
    const form = renderForm(report)

    // 3 行目を 1 行目へ動かし、さらに（新しい）3 行目を 2 行目へ動かす → 3・2・1 の順
    const moveUp = async (number: number, steps: number) => {
      within(row(number))
        .getByRole('button', { name: `${number}行目を並べ替え` })
        .focus()
      await form.user.keyboard(' ')
      for (let i = 0; i < steps; i++) {
        await form.user.keyboard('{ArrowUp}')
      }
      await form.user.keyboard(' ')
    }
    await moveUp(3, 2)
    await moveUp(3, 1)
    rect.mockRestore()

    expect(within(row(1)).getByRole('textbox', { name: /訪問内容/ })).toHaveValue('3件目')
    await form.user.click(form.button('下書き保存'))
    await vi.waitFor(() => expect(put).toHaveBeenCalled())
    expect((put.mock.calls[0]?.[1] as { visit_records: { id: number }[] }).visit_records.map((r) => r.id)).toEqual([
      3, 2, 1,
    ])
  })

  it('T-UI-11: 20 行になると「訪問記録を追加」を押せなくなる', async () => {
    const form = renderForm()
    for (let i = 0; i < 20; i++) {
      await form.user.click(form.button('訪問記録を追加'))
    }

    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(form.button('訪問記録を追加')).toBeDisabled()
    expect(screen.getByText('20 / 20 件')).toBeInTheDocument()
  })

  it('T-UI-12: 顧客セレクトに「工業」と入力すると XYZ工業だけが出る（無効な顧客は選択肢にない）', async () => {
    const form = renderForm()
    await form.user.click(form.button('訪問記録を追加'))
    await form.user.click(within(row(1)).getByRole('combobox', { name: /顧客/ }))
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['ABC商事', 'DEF物産', 'XYZ工業'])

    await form.user.type(screen.getByRole('combobox', { name: '顧客名で絞り込み' }), '工業')

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['XYZ工業'])
    await form.user.click(screen.getByRole('option', { name: 'XYZ工業' }))
    expect(within(row(1)).getByRole('combobox', { name: /顧客/ })).toHaveTextContent('XYZ工業')
  })

  it('何も入力していない行は、送る前に取り除く', async () => {
    post.mockResolvedValue({ data: { id: 141 } })
    const form = renderForm()
    await form.user.click(form.button('訪問記録を追加'))
    await form.user.click(form.button('訪問記録を追加'))
    await fillRow(form.user, 2, 'ABC商事', '訪問')

    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0]?.[1]).toMatchObject({ visit_records: [{ customer_id: 10, content: '訪問' }] })
  })

  it('T-UI-13: 訪問内容・顧客が空の行は、その行の項目の下にエラーを出し、入力内容は消えない', async () => {
    const form = renderForm()
    await form.user.click(form.button('訪問記録を追加'))
    await form.user.click(form.button('訪問記録を追加'))
    await fillRow(form.user, 1, 'ABC商事', '訪問')
    await form.user.type(within(row(2)).getByLabelText('時刻'), '14:30')

    await form.user.click(form.button('下書き保存'))

    expect(await within(row(2)).findByText('訪問内容は必須です')).toBeInTheDocument()
    expect(within(row(2)).getByText('顧客は必須です')).toBeInTheDocument()
    expect(within(row(1)).queryByText(/必須です/)).not.toBeInTheDocument()
    expect(within(row(2)).getByLabelText('時刻')).toHaveValue('14:30')
    expect(within(row(1)).getByRole('textbox', { name: /訪問内容/ })).toHaveValue('訪問')
    expect(post).not.toHaveBeenCalled()
  })

  it('API の訪問記録のエラー（visit_records[1].customer_id）は 2 行目に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'visit_records[1].customer_id', message: '有効な顧客を指定してください' },
      ]),
    )
    const form = renderForm()
    await form.user.click(form.button('訪問記録を追加'))
    await form.user.click(form.button('訪問記録を追加'))
    await fillRow(form.user, 1, 'ABC商事', '1件目')
    await fillRow(form.user, 2, 'XYZ工業', '2件目')

    await form.user.click(form.button('下書き保存'))

    expect(await within(row(2)).findByText('有効な顧客を指定してください')).toBeInTheDocument()
    expect(within(row(1)).queryByText('有効な顧客を指定してください')).not.toBeInTheDocument()
  })

  it('編集では、無効になった顧客の行は「（無効）」を付けて表示し、そのまま送り返す（決定事項 #36）', async () => {
    put.mockResolvedValue({ data: { id: DRAFT.id } })
    const form = renderForm({
      ...DRAFT,
      visitRecords: [{ id: 510, customerId: 13, customerName: '旧取引先', visitedAt: null, content: '挨拶' }],
    })

    expect(within(row(1)).getByRole('combobox', { name: /顧客/ })).toHaveTextContent('旧取引先（無効）')
    await form.user.click(form.button('下書き保存'))

    await vi.waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0]?.[1]).toMatchObject({
      visit_records: [{ id: 510, customer_id: 13, visited_at: null, content: '挨拶' }],
    })
  })
})
