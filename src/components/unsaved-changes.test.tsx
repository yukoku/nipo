import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from './app-providers'
import { useUnsavedChangesGuard } from './unsaved-changes'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))

/** 入力すると「未保存」になるフォーム */
function SampleForm() {
  const [value, setValue] = useState('')
  const [left, setLeft] = useState('')
  const { confirmLeave } = useUnsavedChangesGuard(value !== '')
  return (
    <>
      <label>
        訪問内容
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="button" onClick={async () => setLeft((await confirmLeave()) ? '移動' : '残る')}>
        キャンセル
      </button>
      <p>{left}</p>
      <Link href="/customers?page=2">顧客</Link>
      <a href="/reports" target="_blank">
        新しいタブ
      </a>
      <a href="https://example.com/">別のサイト</a>
      <a href="#visit">同じ画面</a>
    </>
  )
}

function renderForm() {
  render(
    <AppProviders>
      <SampleForm />
    </AppProviders>,
  )
  return userEvent.setup()
}

describe('未保存の離脱確認（M-07）', () => {
  it('入力していなければ、リンクで確認なしに移動する', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('link', { name: '顧客' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('T-UI-15: 入力途中でメニューのリンクを押すと確認ダイアログが出て、「入力を続ける」なら移動しない', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('訪問内容'), '新商品の提案')

    await user.click(screen.getByRole('link', { name: '顧客' }))
    await screen.findByRole('alertdialog', { name: '入力内容が保存されていません。移動してよろしいですか？' })
    await user.click(screen.getByRole('button', { name: '入力を続ける' }))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText('訪問内容')).toHaveValue('新商品の提案')
  })

  it('「移動する」を選ぶと、リンク先へ移動する', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('訪問内容'), 'a')

    await user.click(screen.getByRole('link', { name: '顧客' }))
    await user.click(await screen.findByRole('button', { name: '移動する' }))

    expect(push).toHaveBeenCalledWith('/customers?page=2')
  })

  it('新しいタブ・別のサイト・同じ画面の中へのリンクは止めない', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('訪問内容'), 'a')

    for (const name of ['新しいタブ', '別のサイト', '同じ画面']) {
      fireEvent.click(screen.getByRole('link', { name }))
    }

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Ctrl キーを押しながらのクリック（新しいタブで開く）は止めない', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('訪問内容'), 'a')

    fireEvent.click(screen.getByRole('link', { name: '顧客' }), { ctrlKey: true })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('入力中は、ブラウザを閉じる・再読み込みでブラウザの確認を出す（beforeunload）', async () => {
    const user = renderForm()
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)

    await user.type(screen.getByLabelText('訪問内容'), 'a')
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)

    expect(after.defaultPrevented).toBe(true)
  })

  it('キャンセルボタンなどからは confirmLeave() で確かめる。入力していなければ確認なしで true', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(await screen.findByText('移動')).toBeInTheDocument()

    await user.type(screen.getByLabelText('訪問内容'), 'a')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    await user.click(await screen.findByRole('button', { name: '入力を続ける' }))
    expect(await screen.findByText('残る')).toBeInTheDocument()
  })
})
