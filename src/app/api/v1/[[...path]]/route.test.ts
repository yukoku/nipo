import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { DELETE, GET, PATCH, POST, PUT } from './route'

describe('/api/v1 の存在しないパス', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ])('%s でも JSON の 404 NOT_FOUND を返す', async (method, handler) => {
    const response = await handler(new NextRequest('http://localhost/api/v1/unknown', { method }), undefined)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'API が見つかりません' } })
  })
})
