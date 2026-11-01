/**
 * JSON のキーの命名変換（snake_case ⇔ camelCase）。
 *
 * API の入出力は snake_case（docs/api.md §1.1）、コード内（Prisma・services）は camelCase で扱う。
 * 変換はこのファイルの関数だけで行い、呼び出すのは API の入口と出口
 * （`@/server/api/validation` の入力の読み取りと `@/server/api/response` のレスポンス作成）に限る。
 */

type Primitive = string | number | boolean | bigint | symbol | null | undefined

/** `visitRecords` → `visit_records`（型） */
export type SnakeCase<S extends string> = S extends `${infer Head}${infer Tail}`
  ? `${Head extends Lowercase<Head> ? Head : `_${Lowercase<Head>}`}${SnakeCase<Tail>}`
  : S

/** `visit_records` → `visitRecords`（型） */
export type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S

/** オブジェクトのキーを入れ子まで snake_case にした型 */
export type SnakeCaseKeys<T> = T extends Primitive | Date
  ? T
  : T extends readonly (infer U)[]
    ? SnakeCaseKeys<U>[]
    : T extends object
      ? { [K in keyof T as K extends string ? SnakeCase<K> : K]: SnakeCaseKeys<T[K]> }
      : T

/** オブジェクトのキーを入れ子まで camelCase にした型 */
export type CamelCaseKeys<T> = T extends Primitive | Date
  ? T
  : T extends readonly (infer U)[]
    ? CamelCaseKeys<U>[]
    : T extends object
      ? { [K in keyof T as K extends string ? CamelCase<K> : K]: CamelCaseKeys<T[K]> }
      : T

export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

export function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/** オブジェクトのキーを入れ子（配列の中も含む）まで snake_case にする。Date などのクラスのインスタンスはそのまま */
export function toSnakeCaseKeys<T>(value: T): SnakeCaseKeys<T> {
  return convertKeys(value, toSnakeCase) as SnakeCaseKeys<T>
}

/** オブジェクトのキーを入れ子（配列の中も含む）まで camelCase にする。Date などのクラスのインスタンスはそのまま */
export function toCamelCaseKeys<T>(value: T): CamelCaseKeys<T> {
  return convertKeys(value, toCamelCase) as CamelCaseKeys<T>
}

function convertKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertKeys(item, convert))
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [convert(key), convertKeys(item, convert)]),
    )
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
