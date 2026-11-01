import { describe, expect, it } from 'vitest'

import { buildQueryString, firstValues, pageItems } from './list-query'

describe('buildQueryString', () => {
  it('値のある条件だけをクエリにする', () => {
    expect(buildQueryString({ name: 'ABC', assigned_sales_id: 2, include_inactive: true, page: 3 })).toBe(
      '?name=ABC&assigned_sales_id=2&include_inactive=true&page=3',
    )
  })

  it('空文字・null・undefined・false・1 ページ目は付けない', () => {
    expect(buildQueryString({ name: '', assigned_sales_id: null, x: undefined, include_inactive: false, page: 1 })).toBe('')
  })

  it('日本語などはエンコードする', () => {
    expect(buildQueryString({ name: '商事' })).toBe('?name=%E5%95%86%E4%BA%8B')
  })
})

describe('firstValues', () => {
  it('配列なら最初の値、undefined は除く', () => {
    expect(firstValues({ name: 'ABC', page: ['2', '3'], x: undefined })).toEqual({ name: 'ABC', page: '2' })
  })
})

describe('pageItems', () => {
  it('7 ページ以下なら全ページを並べる', () => {
    expect(pageItems(1, 0)).toEqual([])
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('多いときは、最初・最後・今のページの前後を並べ、間は省略する', () => {
    expect(pageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    expect(pageItems(1, 10)).toEqual([1, 2, 'ellipsis', 10])
    expect(pageItems(10, 10)).toEqual([1, 'ellipsis', 9, 10])
    expect(pageItems(3, 10)).toEqual([1, 2, 3, 4, 'ellipsis', 10])
  })
})
