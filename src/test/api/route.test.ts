import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { callRoute } from './route'

/** 受け取ったリクエストの内容をそのまま JSON で返す、テスト用の Route Handler */
async function echo(request: NextRequest, context: { params: Promise<Record<string, string>> }): Promise<Response> {
  return Response.json({
    method: request.method,
    path: request.nextUrl.pathname,
    query: Object.fromEntries(request.nextUrl.searchParams),
    contentType: request.headers.get('content-type'),
    csrf: request.headers.get('x-csrf-token'),
    body: request.method === 'GET' ? null : await request.text(),
    params: await context.params,
  })
}

describe('callRoute', () => {
  it('省略時は GET で呼び出し、JSON の本文を解析して返す', async () => {
    const response = await callRoute(echo, '/api/v1/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ method: 'GET', path: '/api/v1/health', query: {}, params: {} })
  })

  it('クエリパラメータを付ける（undefined の項目は付けない）', async () => {
    const response = await callRoute(echo, '/api/v1/reports', {
      query: { page: 2, customer_name: 'ABC', include_inactive: true, date_from: undefined },
    })

    expect(response.body).toMatchObject({ query: { page: '2', customer_name: 'ABC', include_inactive: 'true' } })
  })

  it('body は JSON にして送り、Content-Type を付ける', async () => {
    const response = await callRoute(echo, '/api/v1/reports', { method: 'POST', body: { report_date: '2026-10-31' } })

    expect(response.body).toMatchObject({
      method: 'POST',
      contentType: 'application/json',
      body: '{"report_date":"2026-10-31"}',
    })
  })

  it('rawBody はそのまま送る（不正な JSON を送るテスト用）', async () => {
    const response = await callRoute(echo, '/api/v1/reports', { method: 'POST', rawBody: '{invalid' })

    expect(response.body).toMatchObject({ body: '{invalid', contentType: 'text/plain;charset=UTF-8' })
  })

  it('ヘッダーと動的なパスのパラメータを渡す', async () => {
    const response = await callRoute(echo, '/api/v1/reports/101', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': 'token' },
      params: { id: '101' },
    })

    expect(response.body).toMatchObject({ csrf: 'token', params: { id: '101' } })
  })

  it('本文がないレスポンス（204）は body が null になる', async () => {
    const response = await callRoute(() => new Response(null, { status: 204 }), '/api/v1/reports/102', {
      method: 'DELETE',
    })

    expect(response).toMatchObject({ status: 204, body: null })
  })

  it('JSON でない本文は文字列のまま返す', async () => {
    const response = await callRoute(() => new Response('text', { status: 200 }), '/')

    expect(response.body).toBe('text')
  })
})
