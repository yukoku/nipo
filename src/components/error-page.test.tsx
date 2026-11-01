import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Forbidden from '@/app/forbidden'
import NotFound from '@/app/not-found'

describe('エラー画面', () => {
  it('403 画面には「アクセスできません」とトップ画面へのリンクが表示される', () => {
    render(<Forbidden />)

    expect(screen.getByRole('heading', { level: 1, name: 'アクセスできません' })).toBeInTheDocument()
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'トップ画面へ戻る' })).toHaveAttribute('href', '/')
  })

  it('404 画面には「見つかりません」と表示され、権限がない場合と区別しない', () => {
    render(<NotFound />)

    expect(screen.getByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(screen.getByText('お探しのページは存在しないか、表示する権限がありません。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'トップ画面へ戻る' })).toHaveAttribute('href', '/')
  })
})
