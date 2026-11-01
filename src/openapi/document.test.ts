import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createOpenApiDocument } from '@/openapi/document'
import { OPENAPI_OUTPUT_PATH, renderOpenApiYaml } from '@/openapi/render'

describe('OpenAPI 定義', () => {
  it('docs/openapi.yaml が最新である（古ければ npm run openapi:generate を実行してコミットする）', async () => {
    const current = await readFile(OPENAPI_OUTPUT_PATH, 'utf8')
    expect(current).toBe(renderOpenApiYaml())
  })

  it('OpenAPI 3.1 で、ベースパスは /api/v1', () => {
    const document = createOpenApiDocument()

    expect(document.openapi).toBe('3.1.0')
    expect(document.servers).toEqual([{ url: '/api/v1' }])
  })

  it('共通部品（エラーレスポンス・ページングの meta）を components に出す', () => {
    const schemas = createOpenApiDocument().components?.schemas ?? {}

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(['ErrorResponse', 'ErrorCode', 'ConflictReason', 'ValidationErrorDetail', 'PageMeta']),
    )
  })

  it('サンプル API（H-01 ヘルスチェック）を出力する', () => {
    const operation = createOpenApiDocument().paths?.['/health']?.get

    expect(operation).toMatchObject({ operationId: 'H-01', security: [] })
    expect(Object.keys(operation?.responses ?? {})).toEqual(['200', '400', '500'])
  })

  it('operationId が重複していない', () => {
    const ids = Object.values(createOpenApiDocument().paths ?? {}).flatMap((item) =>
      Object.values(item ?? {}).flatMap((operation) =>
        typeof operation === 'object' && operation !== null && 'operationId' in operation ? [operation.operationId] : [],
      ),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})
