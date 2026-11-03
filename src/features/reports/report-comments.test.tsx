import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/components/app-providers'
import type * as apiClient from '@/lib/api-client'
import { ApiClientError } from '@/lib/api-client'
import { CONFIRM_MESSAGES } from '@/lib/messages'

import { type ReportComment, ReportComments } from './report-comments'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }))

const post = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof apiClient>()),
  api: {
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}))

const notifySuccess = vi.fn()
const notifyError = vi.fn()
vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifySuccess(...args),
  notifyError: (...args: unknown[]) => notifyError(...args),
}))

const SUZUKI_ID = 1
const TANAKA_ID = 4

const OWN: ReportComment = {
  id: 801,
  target: 'problem',
  body: '5%までなら即決OK。',
  commenter: { id: SUZUKI_ID, name: '鈴木一郎' },
  createdAt: new Date('2026-10-30T10:10:00Z'),
  updatedAt: new Date('2026-10-30T10:10:00Z'),
}
const EDITED: ReportComment = {
  ...OWN,
  id: 802,
  body: '修正したコメント',
  updatedAt: new Date('2026-10-30T11:00:00Z'),
}
const OTHERS: ReportComment = {
  ...OWN,
  id: 803,
  commenter: { id: TANAKA_ID, name: '田中次郎' },
  body: '他人のコメント',
}

function renderComments({ comments = [] as ReportComment[], canComment = true, currentUserId = SUZUKI_ID } = {}) {
  render(
    <AppProviders>
      <ReportComments
        reportId={101}
        target="problem"
        comments={comments}
        canComment={canComment}
        currentUserId={currentUserId}
      />
    </AppProviders>,
  )
  return { user: userEvent.setup() }
}

const commentItem = (name: RegExp) => screen.getByRole('listitem', { name })

describe('コメントの投稿（SC-04）', () => {
  it('入力して「投稿」すると、対象と本文を送り、M-09 を出して表示を読み込み直し、入力欄を空にする', async () => {
    post.mockResolvedValue({ data: { id: 900 } })
    const { user } = renderComments()
    const input = screen.getByRole('textbox', { name: /Problem へのコメント/ })

    await user.type(input, '確認しました{Enter}2行目')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/reports/101/comments', { target: 'problem', body: '確認しました\n2行目' })
    expect(notifySuccess).toHaveBeenCalledWith('commented')
    expect(input).toHaveValue('')
  })

  it('空・空白だけでは送らず、入力欄の下に必須のエラーを出す', async () => {
    const { user } = renderComments()

    await user.type(screen.getByRole('textbox', { name: /Problem へのコメント/ }), '   ')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    expect(await screen.findByText('コメントは必須です')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('投稿中は「投稿しています…」にして押せなくする（二重投稿の防止）', async () => {
    let resolve: (value: unknown) => void = () => undefined
    post.mockReturnValue(new Promise((r) => (resolve = r)))
    const { user } = renderComments()

    await user.type(screen.getByRole('textbox', { name: /Problem へのコメント/ }), '確認しました')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    const busy = await screen.findByRole('button', { name: '投稿しています…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(post).toHaveBeenCalledTimes(1)
    resolve({ data: { id: 900 } })
    expect(await screen.findByRole('button', { name: '投稿' })).toBeEnabled()
  })

  it('コメントできなくなっていた（403 など）ときはトーストで知らせ、入力内容は残す', async () => {
    post.mockRejectedValue(new ApiClientError(403, 'FORBIDDEN', 'この操作を行う権限がありません'))
    const { user } = renderComments()
    const input = screen.getByRole('textbox', { name: /Problem へのコメント/ })

    await user.type(input, '確認しました')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('この操作を行う権限がありません'))
    expect(input).toHaveValue('確認しました')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('API の入力エラー（400）は入力欄の下に出す', async () => {
    post.mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'body', message: 'コメントは1000文字以内で入力してください' },
      ]),
    )
    const { user } = renderComments()

    await user.type(screen.getByRole('textbox', { name: /Problem へのコメント/ }), 'あ')
    await user.click(screen.getByRole('button', { name: '投稿' }))

    expect(await screen.findByText('コメントは1000文字以内で入力してください')).toBeInTheDocument()
  })
})

describe('コメントの表示と編集・削除（SC-04）', () => {
  it('編集されたコメントには「（編集済み）」を付ける', () => {
    renderComments({ comments: [OWN, EDITED] })

    expect(screen.getByText(OWN.body).closest('li')).not.toHaveTextContent('編集済み')
    expect(screen.getByText('修正したコメント').closest('li')).toHaveTextContent('（編集済み）')
  })

  it('自分のコメントにだけ「…」メニューを出す', () => {
    renderComments({ comments: [OWN, OTHERS] })

    expect(within(commentItem(/鈴木一郎/)).getByRole('button', { name: 'コメントの操作' })).toBeInTheDocument()
    expect(within(commentItem(/田中次郎/)).queryByRole('button', { name: 'コメントの操作' })).not.toBeInTheDocument()
  })

  it('「…」→「編集」で本文を直して保存すると、更新して M-09 を出し、表示を読み込み直す', async () => {
    put.mockResolvedValue({ data: { id: OWN.id } })
    const { user } = renderComments({ comments: [OWN] })

    await user.click(screen.getByRole('button', { name: 'コメントの操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '編集' }))
    const input = within(screen.getByRole('form', { name: 'コメントの編集' })).getByRole('textbox')
    expect(input).toHaveValue(OWN.body)
    await user.clear(input)
    await user.type(input, '7%までは私に一報を。')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(put).toHaveBeenCalledWith(`/comments/${OWN.id}`, { body: '7%までは私に一報を。' })
    expect(notifySuccess).toHaveBeenCalledWith('saved')
    expect(screen.queryByRole('form', { name: 'コメントの編集' })).not.toBeInTheDocument()
  })

  it('編集をキャンセルすると、送らずに元の表示に戻る', async () => {
    const { user } = renderComments({ comments: [OWN] })

    await user.click(screen.getByRole('button', { name: 'コメントの操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '編集' }))
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.getByText(OWN.body)).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('「…」→「削除」で M-08 を出し、キャンセルなら削除しない', async () => {
    const { user } = renderComments({ comments: [OWN] })

    await user.click(screen.getByRole('button', { name: 'コメントの操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '削除' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(CONFIRM_MESSAGES.deleteComment.title)
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

    expect(del).not.toHaveBeenCalled()
  })

  it('M-08 で「削除する」を選ぶと削除し、M-09 を出して表示を読み込み直す', async () => {
    del.mockResolvedValue(null)
    const { user } = renderComments({ comments: [OWN] })

    await user.click(screen.getByRole('button', { name: 'コメントの操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '削除' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '削除する' }))

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(del).toHaveBeenCalledWith(`/comments/${OWN.id}`)
    expect(notifySuccess).toHaveBeenCalledWith('deleted')
  })

  it('削除に失敗したらトーストで知らせ、もう一度操作できる', async () => {
    del.mockRejectedValue(new ApiClientError(404, 'NOT_FOUND', '対象が見つかりません'))
    const { user } = renderComments({ comments: [OWN] })

    await user.click(screen.getByRole('button', { name: 'コメントの操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '削除' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '削除する' }))

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('対象が見つかりません'))
    expect(screen.getByRole('button', { name: 'コメントの操作' })).toBeEnabled()
  })
})
