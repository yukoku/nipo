import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import { ERROR_MESSAGES } from './messages'
import { notifyError, notifySuccess } from './notify'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('notifySuccess（M-09）', () => {
  it.each([
    ['saved', '保存しました'],
    ['submitted', '提出しました'],
    ['commented', 'コメントを投稿しました'],
  ] as const)('%s なら「%s」をトーストで出す', (kind, message) => {
    notifySuccess(kind)
    expect(toast.success).toHaveBeenCalledWith(message)
  })
})

describe('notifyError', () => {
  it('指定した文言、省略時は既定の文言をトーストで出す', () => {
    notifyError('この日付の日報は既に作成されています')
    notifyError()

    expect(vi.mocked(toast.error).mock.calls).toEqual([['この日付の日報は既に作成されています'], [ERROR_MESSAGES.unexpected]])
  })
})
