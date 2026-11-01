import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyAttemptsError,
  UnauthenticatedError,
} from '@/server/api/errors'
import { created, noContent, ok } from '@/server/api/response'
import { parseJsonBody } from '@/server/api/validation'
import { type ApiHook, withApi } from '@/server/api/with-api'

/** 日報作成（R-02）に似たサンプルのスキーマ */
const sampleSchema = z.object({
  report_date: z.string(),
  visit_records: z
    .array(z.object({ customer_id: z.int(), content: z.string().trim().min(1).max(2000) }))
    .max(20),
})

/** サンプル API：本文の `scenario` に応じて、成功・各種エラーを返す */
const sampleApi = withApi(async (request: NextRequest) => {
  const scenario = request.nextUrl.searchParams.get('scenario')
  switch (scenario) {
    case 'unauthenticated':
      throw new UnauthenticatedError()
    case 'forbidden':
      throw new ForbiddenError()
    case 'not-found':
      throw new NotFoundError()
    case 'conflict':
      throw new ConflictError('REPORT_ALREADY_EXISTS')
    case 'unexpected':
      throw new Error('DB の接続文字列 postgresql://secret@db が不正です')
    default: {
      const input = await parseJsonBody(request, sampleSchema)
      return created({ id: 101, ...input }, '/api/v1/reports/101')
    }
  }
})

const validBody = { report_date: '2026-10-31', visit_records: [{ customer_id: 10, content: '新商品の提案' }] }

function post(body: unknown, scenario?: string, init: { rawBody?: string } = {}): NextRequest {
  const url = new URL('http://localhost/api/v1/sample')
  if (scenario) {
    url.searchParams.set('scenario', scenario)
  }
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: init.rawBody ?? JSON.stringify(body),
  })
}

describe('withApi（サンプル API）', () => {
  it('成功すると、入力を camelCase で受け取り、レスポンスは snake_case で返す', async () => {
    const response = await sampleApi(post(validBody), undefined)

    expect(response.status).toBe(201)
    expect(response.headers.get('Location')).toBe('/api/v1/reports/101')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: { id: 101, report_date: '2026-10-31', visit_records: [{ customer_id: 10, content: '新商品の提案' }] },
    })
  })

  it('入力チェックエラーは 400 VALIDATION_ERROR と項目別の details を返す', async () => {
    const response = await sampleApi(post({ visit_records: [] }), undefined)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力内容に誤りがあります',
        details: [{ field: 'report_date', message: '報告日は必須です' }],
      },
    })
  })

  it('入れ子の配列のエラーは field が visit_records[1].content の形式になる（T-RPT-09 の前提）', async () => {
    const body = {
      ...validBody,
      visit_records: [
        { customer_id: 10, content: '新商品の提案' },
        { customer_id: 11, content: '' },
      ],
    }
    const response = await sampleApi(post(body), undefined)

    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: { details: unknown } }
    expect(json.error.details).toEqual([{ field: 'visit_records[1].content', message: '訪問内容は必須です' }])
  })

  it('本文が JSON でなければ 400 を返す', async () => {
    const response = await sampleApi(post(undefined, undefined, { rawBody: '{ invalid' }), undefined)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'リクエストの本文が JSON の形式になっていません', details: [] },
    })
  })

  it.each([
    ['unauthenticated', 401, 'UNAUTHENTICATED', 'ログインしてください'],
    ['forbidden', 403, 'FORBIDDEN', 'この操作を行う権限がありません'],
    ['not-found', 404, 'NOT_FOUND', '対象が見つかりません'],
  ])('%s のエラーは %i %s を返す', async (scenario, status, code, message) => {
    const response = await sampleApi(post(validBody, scenario), undefined)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { code, message } })
  })

  it('409 は code=CONFLICT と理由（reason）を返す', async () => {
    const response = await sampleApi(post(validBody, 'conflict'), undefined)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'CONFLICT', reason: 'REPORT_ALREADY_EXISTS', message: 'この日付の日報は既に作成されています' },
    })
  })

  it('想定外の例外は 500 INTERNAL_ERROR を返し、詳細はレスポンスに含めずログにだけ出す', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const response = await sampleApi(post(validBody, 'unexpected'), undefined)

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'サーバーでエラーが発生しました。しばらくしてから再度お試しください' },
    })
    expect(text).not.toContain('secret')

    expect(stderr).toHaveBeenCalledOnce()
    const log = JSON.parse(String(stderr.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(log).toMatchObject({
      severity: 'ERROR',
      message: 'API で想定外のエラーが発生しました',
      error: { name: 'Error', message: 'DB の接続文字列 postgresql://secret@db が不正です' },
      httpRequest: { requestMethod: 'POST', requestUrl: '/api/v1/sample' },
    })
    expect(log.stack_trace).toEqual(expect.stringContaining('Error: DB の接続文字列'))
    stderr.mockRestore()
  })
})

describe('withApi の共通処理', () => {
  const request = () => new NextRequest('http://localhost/api/v1/sample')

  it('before のフックを順に実行してからハンドラーを呼ぶ', async () => {
    const calls: string[] = []
    const hook =
      (name: string): ApiHook =>
      () => {
        calls.push(name)
      }
    const handler = withApi(
      () => {
        calls.push('handler')
        return noContent()
      },
      { before: [hook('auth'), hook('csrf')] },
    )

    const response = await handler(request(), undefined)

    expect(response.status).toBe(204)
    expect(calls).toEqual(['auth', 'csrf', 'handler'])
  })

  it('フックがエラーを投げると、ハンドラーを呼ばずにエラーレスポンスを返す', async () => {
    const handler = vi.fn(() => ok({}))
    const api = withApi(handler, {
      before: [
        async () => {
          throw new UnauthenticatedError()
        },
      ],
    })

    const response = await api(request(), undefined)

    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('Route Handler の context（params）をそのまま渡す', async () => {
    const api = withApi(async (_request, { params }: { params: Promise<{ id: string }> }) => ok({ id: (await params).id }))

    const response = await api(request(), { params: Promise.resolve({ id: '101' }) })

    expect(await response.json()).toEqual({ data: { id: '101' } })
  })

  it('schema.parse() の例外（ZodError）も 400 にする', async () => {
    const api = withApi(() => {
      z.object({ page: z.number() }).parse({})
      return ok({})
    })

    const response = await api(request(), undefined)

    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: { code: string; details: { field: string }[] } }
    expect(json.error.code).toBe('VALIDATION_ERROR')
    expect(json.error.details.map((detail) => detail.field)).toEqual(['page'])
  })

  it('429 TOO_MANY_ATTEMPTS を返せる（A-01）', async () => {
    const api = withApi(() => {
      throw new TooManyAttemptsError()
    })

    const response = await api(request(), undefined)

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'ログインに続けて失敗したため、しばらくログインできません。15分ほど待ってから再度お試しください',
      },
    })
  })
})
