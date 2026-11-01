import { describe, expect, it } from 'vitest'

import { callRoute } from '@/test/api/route'

import { GET } from './route'

// テスト用DB に実際に接続して確かめる（DB をモックした確認は route.test.ts）
describe('GET /api/v1/health（H-01・テスト用DB）', () => {
  it('T-HLT-01: 認証なしで 200 と status=ok を返す', async () => {
    const response = await callRoute(GET, '/api/v1/health')

    expect(response).toMatchObject({ status: 200, body: { data: { status: 'ok' } } })
  })

  it('T-HLT-02: check=db なら実際に DB に接続し、checks.db=ok を返す', async () => {
    const response = await callRoute(GET, '/api/v1/health', { query: { check: 'db' } })

    expect(response).toMatchObject({ status: 200, body: { data: { status: 'ok', checks: { db: 'ok' } } } })
  })

  it('T-HLT-03: check に不正な値を指定すると 400 を返す', async () => {
    const response = await callRoute(GET, '/api/v1/health', { query: { check: 'cache' } })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })
})
