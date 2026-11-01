import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { CONFIRM_MESSAGES, type ConfirmOptions } from '@/lib/messages'

import { ConfirmProvider, useConfirm } from './confirm-dialog'

function Sample({ options }: { options: ConfirmOptions }) {
  const confirm = useConfirm()
  const [result, setResult] = useState('未回答')
  return (
    <>
      <button type="button" onClick={async () => setResult((await confirm(options)) ? 'はい' : 'いいえ')}>
        操作する
      </button>
      <p>結果：{result}</p>
    </>
  )
}

function renderSample(options: ConfirmOptions = CONFIRM_MESSAGES.submitReport) {
  render(
    <ConfirmProvider>
      <Sample options={options} />
    </ConfirmProvider>,
  )
  return userEvent.setup()
}

describe('確認ダイアログ', () => {
  it('M-06: 文言が表示され、実行するボタンで true が返る', async () => {
    const user = renderSample()

    await user.click(screen.getByRole('button', { name: '操作する' }))
    const dialog = await screen.findByRole('alertdialog', { name: '日報を提出します。よろしいですか？' })
    await user.click(screen.getByRole('button', { name: '提出する' }))

    expect(dialog).not.toBeInTheDocument()
    expect(await screen.findByText('結果：はい')).toBeInTheDocument()
  })

  it('T-UI-14: キャンセルすると false が返り、何も起きない', async () => {
    const user = renderSample()

    await user.click(screen.getByRole('button', { name: '操作する' }))
    await user.click(await screen.findByRole('button', { name: 'キャンセル' }))

    expect(await screen.findByText('結果：いいえ')).toBeInTheDocument()
  })

  it('Esc キーで閉じたときも false', async () => {
    const user = renderSample(CONFIRM_MESSAGES.deleteDraft)

    await user.click(screen.getByRole('button', { name: '操作する' }))
    await screen.findByRole('alertdialog', { name: 'この下書きを削除します。よろしいですか？' })
    await user.keyboard('{Escape}')

    expect(await screen.findByText('結果：いいえ')).toBeInTheDocument()
  })

  it('説明文とボタンの文言を指定できる（M-07）', async () => {
    const user = renderSample(CONFIRM_MESSAGES.leaveUnsaved)

    await user.click(screen.getByRole('button', { name: '操作する' }))

    expect(await screen.findByText('移動すると、入力した内容は失われます。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '入力を続ける' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移動する' })).toBeInTheDocument()
  })

  it('Provider の外で使うとエラーになる', () => {
    expect(() => render(<Sample options={CONFIRM_MESSAGES.submitReport} />)).toThrow('ConfirmProvider')
  })
})
