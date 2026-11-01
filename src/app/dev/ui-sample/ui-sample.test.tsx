import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import { UiSample } from './ui-sample'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

describe('UiSample のフォーム', () => {
  it('空のまま保存すると、各項目の下にエラーが表示される', async () => {
    const user = userEvent.setup()
    render(<UiSample />)

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('顧客名は必須です')).toBeInTheDocument()
    expect(screen.getByText('訪問内容は必須です')).toBeInTheDocument()
    expect(screen.getByLabelText('顧客名 *')).toHaveAttribute('aria-invalid', 'true')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('正しく入力して保存すると、完了トーストを出して入力欄を空にする', async () => {
    const user = userEvent.setup()
    render(<UiSample />)

    await user.type(screen.getByLabelText('顧客名 *'), 'ABC商事')
    await user.type(screen.getByLabelText('訪問内容 *'), '新商品の提案')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('保存しました', { description: 'ABC商事：新商品の提案' })
    })
    expect(screen.getByLabelText('顧客名 *')).toHaveValue('')
  })
})
