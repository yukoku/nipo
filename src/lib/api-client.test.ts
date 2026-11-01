import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, api, apiRequest, setCsrfToken } from './api-client'

type Call = { url: string; method: string; csrf: string | null; body: unknown }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const meResponse = (token: string) => json(200, { data: { id: 2, name: '山田太郎', csrf_token: token } })
const csrfError = () => json(403, { error: { code: 'FORBIDDEN', reason: 'CSRF_TOKEN_INVALID', message: '確認できませんでした' } })

/** fetch を差し替える。`responses` を順に返し、呼ばれた内容を `calls` に記録する */
function mockFetch(...responses: Response[]): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      calls.push({
        url,
        method: init.method ?? 'GET',
        csrf: headers.get('X-CSRF-Token'),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      const response = responses.shift()
      if (response === undefined) throw new Error('想定より多く fetch が呼ばれました')
      return response
    }),
  )
  return calls
}

beforeEach(() => {
  setCsrfToken(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('GET は CSRF トークンを取得・付与せずに呼ぶ', async () => {
    const calls = mockFetch(json(200, { data: [] }))

    await expect(api.get('/reports', { query: { page: 2, customer_name: 'ABC', date_from: undefined } })).resolves.toEqual({
      data: [],
    })

    expect(calls).toEqual([{ url: '/api/v1/reports?page=2&customer_name=ABC', method: 'GET', csrf: null, body: undefined }])
  })

  it('ログイン API は、CSRF トークンを取得・付与せずに呼ぶ（ログイン前は GET /auth/me が 401 になるため）', async () => {
    const calls = mockFetch(json(200, { data: { id: 2, csrf_token: 'token-1' } }))

    await expect(api.post('/auth/login', { email: 'yamada@example.com', password: 'Passw0rd' })).resolves.toEqual({
      data: { id: 2, csrf_token: 'token-1' },
    })

    expect(calls).toEqual([
      { url: '/api/v1/auth/login', method: 'POST', csrf: null, body: { email: 'yamada@example.com', password: 'Passw0rd' } },
    ])
  })

  it('更新系は、GET /auth/me で取得した CSRF トークンを X-CSRF-Token に付ける', async () => {
    const calls = mockFetch(meResponse('token-1'), json(201, { data: { id: 106 } }))

    await expect(api.post('/reports', { report_date: '2026-10-31' })).resolves.toEqual({ data: { id: 106 } })

    expect(calls).toEqual([
      { url: '/api/v1/auth/me', method: 'GET', csrf: null, body: undefined },
      { url: '/api/v1/reports', method: 'POST', csrf: 'token-1', body: { report_date: '2026-10-31' } },
    ])
  })

  it('取得したトークンは使い回す（2 回目以降は /auth/me を呼ばない）', async () => {
    const calls = mockFetch(meResponse('token-1'), json(200, {}), new Response(null, { status: 204 }))

    await api.put('/reports/101', {})
    await api.delete('/reports/102')

    expect(calls.map((c) => [c.method, c.url, c.csrf])).toEqual([
      ['GET', '/api/v1/auth/me', null],
      ['PUT', '/api/v1/reports/101', 'token-1'],
      ['DELETE', '/api/v1/reports/102', 'token-1'],
    ])
  })

  it('同時に複数の更新をしても、トークンの取得は 1 回だけ', async () => {
    const calls = mockFetch(meResponse('token-1'), json(200, {}), json(200, {}))

    await Promise.all([api.post('/a'), api.post('/b')])

    expect(calls.filter((c) => c.url === '/api/v1/auth/me')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.csrf)).toEqual(['token-1', 'token-1'])
  })

  it('setCsrfToken で入れたトークンがあれば、/auth/me を呼ばない（ログイン直後）', async () => {
    setCsrfToken('token-from-login')
    const calls = mockFetch(json(200, {}))

    await api.post('/reports', {})

    expect(calls).toEqual([expect.objectContaining({ url: '/api/v1/reports', csrf: 'token-from-login' })])
  })

  it('CSRF の 403 が返ったら、トークンを取り直して 1 回だけ再送する', async () => {
    setCsrfToken('old-token')
    const calls = mockFetch(csrfError(), meResponse('new-token'), json(201, { data: { id: 106 } }))

    await expect(api.post('/reports', { a: 1 })).resolves.toEqual({ data: { id: 106 } })

    expect(calls.map((c) => [c.method, c.url, c.csrf])).toEqual([
      ['POST', '/api/v1/reports', 'old-token'],
      ['GET', '/api/v1/auth/me', null],
      ['POST', '/api/v1/reports', 'new-token'],
    ])
  })

  it('再送しても CSRF の 403 なら、それ以上は再送せず ApiClientError を投げる', async () => {
    setCsrfToken('old-token')
    const calls = mockFetch(csrfError(), meResponse('new-token'), csrfError())

    await expect(api.post('/reports')).rejects.toMatchObject({ status: 403, reason: 'CSRF_TOKEN_INVALID' })
    expect(calls).toHaveLength(3)
  })

  it('権限不足の 403（reason なし）は再送しない', async () => {
    setCsrfToken('token')
    const calls = mockFetch(json(403, { error: { code: 'FORBIDDEN', message: 'この操作を行う権限がありません' } }))

    await expect(api.put('/reports/103', {})).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', reason: undefined })
    expect(calls).toHaveLength(1)
  })

  it('400 のエラーは、項目別のメッセージ（details）付きの ApiClientError になる', async () => {
    setCsrfToken('token')
    const details = [{ field: 'visit_records[1].content', message: '訪問内容は必須です' }]
    mockFetch(json(400, { error: { code: 'VALIDATION_ERROR', message: '入力内容に誤りがあります', details } }))

    const error = await api.post('/reports', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: '入力内容に誤りがあります', details })
  })

  it('ログインしていなくて /auth/me が 401 なら、更新を送らずに ApiClientError（401）を投げる', async () => {
    const calls = mockFetch(json(401, { error: { code: 'UNAUTHENTICATED', message: 'ログインしてください' } }))

    await expect(api.post('/reports', {})).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(calls).toHaveLength(1)
  })

  it('本文がないレスポンス（204）は null を返す', async () => {
    setCsrfToken('token')
    mockFetch(new Response(null, { status: 204 }))

    await expect(apiRequest('DELETE', '/reports/102')).resolves.toBeNull()
  })

  it('エラー形式でない失敗（502 など）も ApiClientError にする', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))

    await expect(api.get('/reports')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' })
  })
})
