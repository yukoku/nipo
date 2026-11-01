import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { type ApiDefinition, createRegistry, registerApi, SECURITY } from '@/openapi/registry'
import { dataResponseSchema } from '@/schemas/response'

/** サンプルの API を登録して、生成された paths の 1 件を返す */
function generateOperation(api: Partial<ApiDefinition> & Pick<ApiDefinition, 'method'>) {
  const registry = createRegistry()
  registerApi(registry, {
    path: '/samples',
    id: 'X-01',
    summary: 'サンプル',
    tag: 'サンプル',
    response: { status: 200, description: '成功', schema: dataResponseSchema(z.object({ id: z.int() })) },
    ...api,
  })
  const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'test', version: '1' },
  })
  const operation = document.paths?.['/samples']?.[api.method]
  expect(operation).toBeDefined()
  return { document, operation: operation! }
}

const statuses = (operation: { responses?: object }) => Object.keys(operation.responses ?? {})

describe('registerApi', () => {
  it('認証が必要な GET は、セッション Cookie を要求し、401・500 を自動で付ける', () => {
    const { operation } = generateOperation({ method: 'get' })

    expect(operation.security).toEqual([{ [SECURITY.session]: [] }])
    expect(statuses(operation)).toEqual(['200', '401', '500'])
    expect(operation.operationId).toBe('X-01')
    expect(operation.summary).toBe('X-01 サンプル')
  })

  it('更新系は CSRF トークンも要求し、入力があれば 400、さらに 403 を自動で付ける', () => {
    const { operation } = generateOperation({
      method: 'post',
      request: { body: z.object({ name: z.string() }) },
      response: { status: 201, description: '作成した', schema: dataResponseSchema(z.object({ id: z.int() })) },
      errors: [409],
    })

    expect(operation.security).toEqual([{ [SECURITY.session]: [], [SECURITY.csrf]: [] }])
    expect(statuses(operation)).toEqual(['201', '400', '401', '403', '409', '500'])
    expect(operation.requestBody).toMatchObject({ required: true })
  })

  it('エラーレスポンスは共通の ErrorResponse を参照する', () => {
    const { operation } = generateOperation({ method: 'get', errors: [404] })

    expect(operation.responses?.['404']).toEqual({
      description: expect.stringContaining('NOT_FOUND'),
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
    })
  })

  it('認証不要の API は security を空にし、401・403 を付けない', () => {
    const { operation } = generateOperation({ method: 'delete', auth: 'none' })

    expect(operation.security).toEqual([])
    expect(statuses(operation)).toEqual(['200', '500'])
  })

  it('204 は本文なしで登録でき、パスパラメーター・クエリも登録できる', () => {
    const { operation } = generateOperation({
      method: 'delete',
      request: { params: z.object({ id: z.string() }), query: z.object({ force: z.string().optional() }) },
      response: { status: 204, description: '削除した' },
    })

    expect(operation.responses?.['204']).toEqual({ description: '削除した' })
    expect(operation.parameters?.map((parameter) => ('in' in parameter ? parameter.in : undefined))).toEqual([
      'path',
      'query',
    ])
  })

  it('セキュリティスキーム（Cookie・CSRF ヘッダー）を登録する', () => {
    const { document } = generateOperation({ method: 'get' })

    expect(document.components?.securitySchemes).toEqual({
      [SECURITY.session]: expect.objectContaining({ type: 'apiKey', in: 'cookie', name: 'nipo_session' }),
      [SECURITY.csrf]: expect.objectContaining({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }),
    })
  })
})
