import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Table, TableBody, TableCell } from '@/components/ui/table'

import { LinkRow } from './link-row'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function renderRow() {
  render(
    <Table>
      <TableBody>
        <LinkRow href="/customers/10">
          <TableCell>
            <a href="/customers/10">ABC商事</a>
          </TableCell>
          <TableCell>田中様</TableCell>
          <TableCell>
            <button type="button">操作</button>
          </TableCell>
        </LinkRow>
      </TableBody>
    </Table>,
  )
  return userEvent.setup()
}

describe('LinkRow', () => {
  it('行をクリックすると移動する', async () => {
    const user = renderRow()

    await user.click(screen.getByText('田中様'))

    expect(push).toHaveBeenCalledWith('/customers/10')
  })

  it('行の中のリンク・ボタンを押したときは、行の移動をしない', async () => {
    const user = renderRow()

    await user.click(screen.getByRole('button', { name: '操作' }))
    await user.click(screen.getByRole('link', { name: 'ABC商事' }))

    expect(push).not.toHaveBeenCalled()
  })

  it('Ctrl キーを押しながらクリックすると、新しいタブで開く', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = renderRow()

    await user.keyboard('{Control>}')
    await user.click(screen.getByText('田中様'))
    await user.keyboard('{/Control}')

    expect(open).toHaveBeenCalledWith('/customers/10', '_blank', 'noopener')
    expect(push).not.toHaveBeenCalled()
  })
})
