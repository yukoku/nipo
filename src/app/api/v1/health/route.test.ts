import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dataResponseSchema } from '@/schemas/response'
import { healthSchema } from '@/schemas/health'

import { GET } from './route'

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock('@/server/db/prisma', () => ({ prisma: { $queryRaw: queryRaw } }))

const get = (query = '') => GET(new NextRequest(`http://localhost/api/v1/health${query}`), undefined)

describe('GET /api/v1/health（H-01）', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }])
  })

  it('T-HLT-01: 200 と status=ok を返し、DB には接続しない', async () => {
    const response = await get()

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(body).toEqual({ data: { status: 'ok' } })
    // OpenAPI に登録したレスポンスのスキーマと一致する
    expect(dataResponseSchema(healthSchema).safeParse(body).success).toBe(true)
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('T-HLT-02: check=db なら DB に接続し、checks.db=ok を返す', async () => {
    const response = await get('?check=db')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { status: 'ok', checks: { db: 'ok' } } })
    expect(queryRaw).toHaveBeenCalledOnce()
  })

  it('T-HLT-03: check に不正な値を指定すると 400 を返す', async () => {
    const response = await get('?check=cache')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容に誤りがあります',
        details: [{ field: 'check', message: '確認する項目の値が正しくありません' }],
      },
    })
  })

  it('T-HLT-04: DB に接続できなければ 500 を返し、詳細はログにだけ出す', async () => {
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:55432'))
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const response = await get('?check=db')

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('ECONNREFUSED')
    expect(String(stderr.mock.calls[0]?.[0])).toContain('ECONNREFUSED')
    stderr.mockRestore()
  })
})
