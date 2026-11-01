import 'server-only'

import { NextResponse } from 'next/server'

import type { ApiErrorBody, ApiError } from '@/server/api/errors'
import { type ApiJson, toApiJson } from '@/server/api/serialize'
import type { PageMeta } from '@/schemas/pagination'

/**
 * API のレスポンスを作る関数。データはここで API の形にする（キーは snake_case、Date は `+09:00` 付きの文字列）。
 * services からは camelCase・Date のまま渡す。
 *
 * ログインユーザーごとに内容が変わるため、ブラウザや中継サーバーにキャッシュさせない（`Cache-Control: no-store`）
 */
const NO_STORE = { 'Cache-Control': 'no-store' }

export type DataBody<T> = { data: ApiJson<T> }
export type ListBody<T> = { data: ApiJson<T>[]; meta: PageMeta }

/** 200：`{ data }` */
export function ok<T>(data: T, init: ResponseInit = {}): NextResponse<DataBody<T>> {
  return NextResponse.json({ data: toApiJson(data) }, withNoStore(init))
}

/** 200：一覧（`{ data, meta }`。docs/api.md §1.4） */
export function okList<T>(items: T[], meta: PageMeta): NextResponse<ListBody<T>> {
  return NextResponse.json({ data: toApiJson(items), meta }, withNoStore({}))
}

/** 201：`{ data }`。`location` を渡すと `Location` ヘッダーを付ける */
export function created<T>(data: T, location?: string): NextResponse<DataBody<T>> {
  return NextResponse.json(
    { data: toApiJson(data) },
    withNoStore({ status: 201, headers: location === undefined ? {} : { Location: location } }),
  )
}

/** 204：本文なし */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE })
}

/** エラーレスポンス（docs/api.md §1.5） */
export function errorResponse(error: ApiError): NextResponse<ApiErrorBody> {
  return NextResponse.json(error.toBody(), withNoStore({ status: error.status }))
}

function withNoStore(init: ResponseInit): ResponseInit {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store')
  return { ...init, headers }
}
