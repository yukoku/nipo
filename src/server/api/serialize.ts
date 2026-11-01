import 'server-only'

import { isPlainObject, type SnakeCase, toSnakeCase } from '@/lib/case'
import { toApiDateTime } from '@/lib/date'

type Primitive = string | number | boolean | bigint | symbol | null | undefined

/** services の戻り値（camelCase・Date）を API のレスポンスにした型：キーは snake_case、Date は文字列 */
export type ApiJson<T> = T extends Date
  ? string
  : T extends Primitive
    ? T
    : T extends readonly (infer U)[]
      ? ApiJson<U>[]
      : T extends object
        ? { [K in keyof T as K extends string ? SnakeCase<K> : K]: ApiJson<T[K]> }
        : T

/**
 * services の戻り値を API のレスポンスの値にする（`@/server/api/response` の中で呼ぶ）。
 *
 * - キーを入れ子まで snake_case にする（docs/api.md §1.1）
 * - `Date`（瞬間：`submitted_at`・`created_at` など）は JST の ISO 8601（`+09:00` 付き）にする
 *
 * 報告日（`@db.Date`）・訪問時刻（`@db.Time`）も Prisma からは `Date` で返るが、これは瞬間ではないため、
 * services で `dbDateToDateString()`・`dbTimeToTimeString()` を使って文字列にしてから渡す
 * （そのまま渡すと `2026-10-31T09:00:00+09:00` のような誤った値になる）
 */
export function toApiJson<T>(value: T): ApiJson<T> {
  return convert(value) as ApiJson<T>
}

function convert(value: unknown): unknown {
  if (value instanceof Date) {
    return toApiDateTime(value)
  }
  if (Array.isArray(value)) {
    return value.map(convert)
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [toSnakeCase(key), convert(item)]))
  }
  return value
}
