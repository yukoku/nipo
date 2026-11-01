import { describe, expect, it } from 'vitest'

import { buildPageMeta, toPrismaPagination } from '@/server/api/pagination'
import { created, noContent, ok, okList } from '@/server/api/response'

describe('レスポンスの作成', () => {
  it('ok は { data } を snake_case で返し、キャッシュさせない', async () => {
    const response = ok({ salesStaff: { id: 2 } }, { headers: { 'X-Test': '1' } })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Test')).toBe('1')
    expect(await response.json()).toEqual({ data: { sales_staff: { id: 2 } } })
  })

  it('okList は { data, meta } を返す', async () => {
    const response = okList([{ visitCount: 3 }], buildPageMeta({ page: 1, perPage: 20 }, 1))

    expect(await response.json()).toEqual({
      data: [{ visit_count: 3 }],
      meta: { page: 1, per_page: 20, total_count: 1, total_pages: 1 },
    })
  })

  it('created は 201 を返し、location がなければ Location ヘッダーを付けない', () => {
    const response = created({ id: 1 })
    expect(response.status).toBe(201)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('noContent は本文なしの 204 を返す', async () => {
    const response = noContent()
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })
})

describe('ページング', () => {
  it('page・per_page を Prisma の skip・take にする', () => {
    expect(toPrismaPagination({ page: 1, perPage: 20 })).toEqual({ skip: 0, take: 20 })
    expect(toPrismaPagination({ page: 3, perPage: 20 })).toEqual({ skip: 40, take: 20 })
  })

  it('meta の total_pages は件数を 1 ページの件数で割って切り上げる（T-RPT-30 の前提）', () => {
    expect(buildPageMeta({ page: 2, perPage: 20 }, 25)).toEqual({
      page: 2,
      per_page: 20,
      total_count: 25,
      total_pages: 2,
    })
    expect(buildPageMeta({ page: 1, perPage: 20 }, 40).total_pages).toBe(2)
    expect(buildPageMeta({ page: 1, perPage: 20 }, 0).total_pages).toBe(0)
  })
})
