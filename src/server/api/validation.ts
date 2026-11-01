import 'server-only'

import type { z } from 'zod'

import { type CamelCaseKeys, toCamelCaseKeys } from '@/lib/case'
import { createErrorMap } from '@/lib/validation/error-map'
import { type FieldLabels, formatFieldPath } from '@/lib/validation/field-labels'
import { ValidationError } from '@/server/api/errors'

export interface ParseOptions {
  /** エラーメッセージの項目名の上書き（例：`{ name: '顧客名' }`） */
  labels?: FieldLabels
}

/**
 * Zod スキーマで入力を検証し、キーを camelCase にして返す。エラーなら `ValidationError`（400）を投げる。
 *
 * スキーマは API と同じ snake_case のキーで書く（エラーの `field` を `visit_records[0].content` の形式にするため）。
 */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  options: ParseOptions = {},
): CamelCaseKeys<z.output<S>> {
  const result = schema.safeParse(input, { error: createErrorMap(options.labels) })
  if (!result.success) {
    throw toValidationError(result.error)
  }
  return toCamelCaseKeys(result.data)
}

/** リクエストの本文（JSON）を検証する */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  options: ParseOptions = {},
): Promise<CamelCaseKeys<z.output<S>>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ValidationError([], 'リクエストの本文が JSON の形式になっていません')
  }
  return parseInput(schema, body, options)
}

/**
 * クエリ文字列を検証する。値はすべて文字列なので、数値・真偽値はスキーマ側で変換する（`z.coerce` など）。
 * 同じ名前が複数あるときは最後の値を使う
 */
export function parseSearchParams<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
  options: ParseOptions = {},
): CamelCaseKeys<z.output<S>> {
  return parseInput(schema, Object.fromEntries(searchParams), options)
}

/** Zod のエラーを `ValidationError` に変換する（`details[].field` は `visit_records[0].content` の形式） */
export function toValidationError(error: z.ZodError): ValidationError {
  return new ValidationError(
    error.issues.map((issue) => ({ field: formatFieldPath(issue.path), message: issue.message })),
  )
}
