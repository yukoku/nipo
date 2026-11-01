/**
 * 日付・時刻のユーティリティ（JST 基準）
 *
 * サーバー（Cloud Run）は UTC で動くが、業務上の日付・時刻はすべて Asia/Tokyo を基準にする（docs/api.md §1.1）。
 * 日付・時刻の変換と表示は必ずこのファイルの関数を使い、`toLocaleDateString` などを直接使わない。
 *
 * このファイルでは2種類の値を区別して扱う。
 * - 暦の日付・時刻（DateString / TimeString）：報告日・訪問時刻。タイムゾーンを持たない「2026年10月31日」「14:30」という値。
 *   文字列のまま扱い、タイムゾーンの変換をしない。
 * - 瞬間（Date）：提出日時・作成日時など。世界共通のある一時点。表示や判定のときに JST に変換する。
 */
import { tz } from '@date-fns/tz'
import { format, startOfMonth } from 'date-fns'

/** 業務の基準タイムゾーン */
export const BUSINESS_TIME_ZONE = 'Asia/Tokyo'

const inJst = { in: tz(BUSINESS_TIME_ZONE) }

/** 暦の日付（`YYYY-MM-DD`）。報告日など */
export type DateString = string

/** 暦の時刻（`HH:mm`）。訪問時刻など */
export type TimeString = string

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

// ---------------------------------------------------------------------------
// 入力の確認
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` の形式で、実在する日付か（2026-02-30 や 2026-13-01 は false） */
export function isValidDateString(value: string): value is DateString {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** `HH:mm` の形式で、00:00〜23:59 の範囲か */
export function isValidTimeString(value: string): value is TimeString {
  return TIME_PATTERN.test(value)
}

// ---------------------------------------------------------------------------
// 「今日」の判定（JST）
// ---------------------------------------------------------------------------

/** JST での今日の日付（`YYYY-MM-DD`） */
export function todayInJst(now: Date = new Date()): DateString {
  return format(now, 'yyyy-MM-dd', inJst)
}

/** JST での今月1日の日付（`YYYY-MM-DD`）。日報一覧（SC-02）の期間の初期値に使う */
export function startOfMonthInJst(now: Date = new Date()): DateString {
  return format(startOfMonth(now, inJst), 'yyyy-MM-dd', inJst)
}

/** JST の今日より後の日付か（日報の未来日チェック。T-RPT-05） */
export function isFutureDate(date: DateString, now: Date = new Date()): boolean {
  assertDateString(date)
  // `YYYY-MM-DD` は文字列の大小がそのまま日付の前後になる
  return date > todayInJst(now)
}

// ---------------------------------------------------------------------------
// 画面表示用（docs/screens.md §3.2）
// ---------------------------------------------------------------------------

/** 暦の日付を `YYYY/MM/DD（曜）` で表示する。例：`2026-10-31` → `2026/10/31（土）` */
export function formatDateForDisplay(date: DateString): string {
  const { year, month, day } = parseDateString(date)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${date.replaceAll('-', '/')}（${weekday}）`
}

/** 瞬間を JST の `YYYY/MM/DD HH:mm` で表示する。例：`2026-10-31T09:05:00Z` → `2026/10/31 18:05` */
export function formatDateTimeForDisplay(instant: Date): string {
  assertValidInstant(instant)
  return format(instant, 'yyyy/MM/dd HH:mm', inJst)
}

// ---------------------------------------------------------------------------
// API 用（docs/api.md §1.1）
// ---------------------------------------------------------------------------

/** 瞬間を JST の ISO 8601（`+09:00` 付き）にする。例：`2026-10-31T09:05:00Z` → `2026-10-31T18:05:00+09:00` */
export function toApiDateTime(instant: Date): string {
  assertValidInstant(instant)
  return format(instant, "yyyy-MM-dd'T'HH:mm:ssXXX", inJst)
}

// ---------------------------------------------------------------------------
// Prisma（DB）との変換
// ---------------------------------------------------------------------------

/**
 * 暦の日付を Prisma の `@db.Date` 列に保存する値にする。
 * Prisma は `Date` の UTC の年月日を保存するため、UTC の 0 時として作る（JST の 0 時にすると前日になる）
 */
export function dateStringToDbDate(date: DateString): Date {
  const { year, month, day } = parseDateString(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** Prisma の `@db.Date` 列から読んだ値を暦の日付にする（UTC の年月日を使う） */
export function dbDateToDateString(value: Date): DateString {
  assertValidInstant(value)
  return value.toISOString().slice(0, 10)
}

/**
 * 暦の時刻を Prisma の `@db.Time` 列に保存する値にする。
 * Prisma は `Date` の UTC の時分秒を保存するため、`1970-01-01THH:mm:00Z` として作る
 */
export function timeStringToDbTime(time: TimeString): Date {
  if (!isValidTimeString(time)) {
    throw new RangeError(`時刻の形式が正しくありません（HH:mm）: ${time}`)
  }
  return new Date(`1970-01-01T${time}:00Z`)
}

/** Prisma の `@db.Time` 列から読んだ値を暦の時刻にする（UTC の時分を使う） */
export function dbTimeToTimeString(value: Date): TimeString {
  assertValidInstant(value)
  return value.toISOString().slice(11, 16)
}

// ---------------------------------------------------------------------------
// 内部用
// ---------------------------------------------------------------------------

function parseDateString(date: DateString): { year: number; month: number; day: number } {
  assertDateString(date)
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

function assertDateString(date: string): asserts date is DateString {
  if (!isValidDateString(date)) {
    throw new RangeError(`日付の形式が正しくありません（YYYY-MM-DD）: ${date}`)
  }
}

function assertValidInstant(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('無効な日時です')
  }
}
