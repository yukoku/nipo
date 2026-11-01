import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListPagination } from './list-pagination'

const QUERY = { name: 'ABC', include_inactive: true }

describe('ListPagination', () => {
  it('ページ番号のリンクに検索条件を付け、今のページに印を付ける', () => {
    render(<ListPagination meta={{ page: 2, total_pages: 3 }} pathname="/customers" query={QUERY} />)
    const nav = within(screen.getByRole('navigation', { name: 'ページ送り' }))

    expect(nav.getByRole('link', { name: '1ページ目' })).toHaveAttribute('href', '/customers?name=ABC&include_inactive=true')
    expect(nav.getByRole('link', { name: '2ページ目' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: '3ページ目' })).toHaveAttribute(
      'href',
      '/customers?name=ABC&include_inactive=true&page=3',
    )
    expect(nav.getByRole('link', { name: '前のページ' })).toHaveAttribute('href', '/customers?name=ABC&include_inactive=true')
    expect(nav.getByRole('link', { name: '次のページ' })).toHaveAttribute(
      'href',
      '/customers?name=ABC&include_inactive=true&page=3',
    )
  })

  it('最初のページでは「前へ」、最後のページでは「次へ」を押せない', () => {
    const { unmount } = render(<ListPagination meta={{ page: 1, total_pages: 2 }} pathname="/customers" query={{}} />)
    expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled()
    unmount()

    render(<ListPagination meta={{ page: 2, total_pages: 2 }} pathname="/customers" query={{}} />)
    expect(screen.getByRole('button', { name: '次のページ' })).toBeDisabled()
  })

  it('1 ページ以下なら表示しない', () => {
    render(<ListPagination meta={{ page: 1, total_pages: 1 }} pathname="/customers" query={{}} />)

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('ページが多いときは間を省略する', () => {
    render(<ListPagination meta={{ page: 5, total_pages: 10 }} pathname="/customers" query={{}} />)

    expect(screen.getAllByRole('link', { name: /ページ目$/ }).map((link) => link.textContent)).toEqual(['1', '4', '5', '6', '10'])
  })
})
