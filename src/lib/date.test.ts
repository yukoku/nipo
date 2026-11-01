import { describe, expect, it } from 'vitest'

import { setupFixedTime } from '@/test/time'

import {
  dateStringToDbDate,
  dbDateToDateString,
  dbTimeToTimeString,
  formatDateForDisplay,
  formatDateTimeForDisplay,
  isFutureDate,
  isValidDateString,
  isValidTimeString,
  startOfMonthInJst,
  timeStringToDbTime,
  toApiDateTime,
  todayInJst,
} from './date'

describe('isValidDateString', () => {
  it.each(['2026-10-31', '2024-02-29', '2026-01-01', '2026-12-31'])('%s は正しい日付', (value) => {
    expect(isValidDateString(value)).toBe(true)
  })

  it.each([
    ['2026-02-29', 'うるう年でない年の 2/29'],
    ['2026-02-30', '存在しない日'],
    ['2026-13-01', '存在しない月'],
    ['2026-00-10', '0 月'],
    ['2026-10-00', '0 日'],
    ['2026/10/31', '区切りがスラッシュ'],
    ['2026-1-5', '0 埋めなし'],
    ['20261031', '区切りなし'],
    ['', '空文字'],
  ])('%s は不正（%s）', (value) => {
    expect(isValidDateString(value)).toBe(false)
  })
})

describe('isValidTimeString', () => {
  it.each(['00:00', '09:05', '14:30', '23:59'])('%s は正しい時刻', (value) => {
    expect(isValidTimeString(value)).toBe(true)
  })

  it.each(['24:00', '25:00', '12:60', '9:05', '09:5', 'abc', '14:30:00', ''])('%s は不正', (value) => {
    expect(isValidTimeString(value)).toBe(false)
  })
})

describe('todayInJst', () => {
  it.each([
    ['2026-10-31T14:59:59Z', '2026-10-31', 'UTC 14:59 は JST の 23:59（同じ日）'],
    ['2026-10-31T15:00:00Z', '2026-11-01', 'UTC 15:00 は JST の翌日 0:00'],
    ['2026-10-30T15:00:00Z', '2026-10-31', 'UTC で前日の 15:00 は JST の当日 0:00'],
    ['2026-12-31T15:00:00Z', '2027-01-01', '年をまたぐ'],
    ['2024-02-28T15:00:00Z', '2024-02-29', 'うるう日'],
  ])('%s → %s（%s）', (now, expected) => {
    expect(todayInJst(new Date(now))).toBe(expected)
  })

  describe('引数を省略したとき', () => {
    setupFixedTime() // 2026-10-31 10:00 JST

    it('現在日時の JST の日付を返す', () => {
      expect(todayInJst()).toBe('2026-10-31')
    })
  })
})

describe('startOfMonthInJst', () => {
  it.each([
    ['2026-10-31T10:00:00+09:00', '2026-10-01', '月の途中'],
    ['2026-10-31T15:00:00Z', '2026-11-01', 'UTC では 10 月末でも、JST ではもう 11 月'],
    ['2026-11-01T00:00:00+09:00', '2026-11-01', '月初の 0:00'],
    ['2026-12-31T15:00:00Z', '2027-01-01', '年をまたぐ'],
  ])('%s → %s（%s）', (now, expected) => {
    expect(startOfMonthInJst(new Date(now))).toBe(expected)
  })

  describe('引数を省略したとき', () => {
    setupFixedTime()

    it('現在日時の JST の月初を返す', () => {
      expect(startOfMonthInJst()).toBe('2026-10-01')
    })
  })
})

describe('isFutureDate（T-RPT-05 の判定）', () => {
  const now = new Date('2026-10-31T10:00:00+09:00')

  it.each([
    ['2026-11-01', true, '明日は未来日'],
    ['2026-10-31', false, '今日は未来日ではない'],
    ['2026-10-30', false, '昨日'],
    ['2027-01-01', true, '翌年'],
  ])('%s → %s（%s）', (date, expected) => {
    expect(isFutureDate(date, now)).toBe(expected)
  })

  it('JST の 0:00 を過ぎると、UTC ではまだ前日でも翌日が「今日」になる', () => {
    // UTC 2026-10-31 15:00 = JST 2026-11-01 0:00
    expect(isFutureDate('2026-11-01', new Date('2026-10-31T15:00:00Z'))).toBe(false)
    expect(isFutureDate('2026-11-01', new Date('2026-10-31T14:59:59Z'))).toBe(true)
  })

  it('不正な日付は例外を投げる', () => {
    expect(() => isFutureDate('2026-02-30', now)).toThrow(RangeError)
  })

  describe('現在日時を省略したとき', () => {
    setupFixedTime()

    it('現在日時を基準に判定する', () => {
      expect(isFutureDate('2026-11-01')).toBe(true)
      expect(isFutureDate('2026-10-31')).toBe(false)
    })
  })
})

describe('formatDateForDisplay', () => {
  it.each([
    ['2026-10-31', '2026/10/31（土）'],
    ['2026-11-01', '2026/11/01（日）'],
    ['2026-11-02', '2026/11/02（月）'],
    ['2024-02-29', '2024/02/29（木）'],
    ['2027-01-01', '2027/01/01（金）'],
  ])('%s → %s', (date, expected) => {
    expect(formatDateForDisplay(date)).toBe(expected)
  })

  it('不正な日付は例外を投げる', () => {
    expect(() => formatDateForDisplay('2026-13-01')).toThrow(RangeError)
  })
})

describe('formatDateTimeForDisplay', () => {
  it.each([
    ['2026-10-31T09:05:00Z', '2026/10/31 18:05'],
    ['2026-10-31T14:59:00Z', '2026/10/31 23:59'],
    ['2026-10-31T15:00:00Z', '2026/11/01 00:00'],
    ['2026-12-31T15:30:00Z', '2027/01/01 00:30'],
  ])('%s → %s（JST で表示）', (instant, expected) => {
    expect(formatDateTimeForDisplay(new Date(instant))).toBe(expected)
  })

  it('無効な日時は例外を投げる', () => {
    expect(() => formatDateTimeForDisplay(new Date('invalid'))).toThrow(RangeError)
  })
})

describe('toApiDateTime', () => {
  it.each([
    ['2026-10-31T09:05:00Z', '2026-10-31T18:05:00+09:00'],
    ['2026-10-31T15:00:00Z', '2026-11-01T00:00:00+09:00'],
    ['2026-10-31T18:05:30.999Z', '2026-11-01T03:05:30+09:00'],
  ])('%s → %s', (instant, expected) => {
    expect(toApiDateTime(new Date(instant))).toBe(expected)
  })

  it('出力を Date に戻すと同じ時点になる（ミリ秒は切り捨て）', () => {
    const instant = new Date('2026-10-31T09:05:00Z')
    expect(new Date(toApiDateTime(instant)).getTime()).toBe(instant.getTime())
  })

  it('無効な日時は例外を投げる', () => {
    expect(() => toApiDateTime(new Date(Number.NaN))).toThrow(RangeError)
  })
})

describe('Prisma の @db.Date との変換', () => {
  it('UTC の 0 時の Date にする（JST の 0 時にすると前日の日付で保存されてしまう）', () => {
    expect(dateStringToDbDate('2026-10-31').toISOString()).toBe('2026-10-31T00:00:00.000Z')
  })

  it.each(['2026-10-31', '2026-01-01', '2026-12-31', '2024-02-29'])('%s を往復しても同じ日付になる', (date) => {
    expect(dbDateToDateString(dateStringToDbDate(date))).toBe(date)
  })

  it('DB から読んだ値（UTC の 0 時）を日付にする', () => {
    expect(dbDateToDateString(new Date('2026-10-31T00:00:00.000Z'))).toBe('2026-10-31')
  })

  it('不正な値は例外を投げる', () => {
    expect(() => dateStringToDbDate('2026-02-30')).toThrow(RangeError)
    expect(() => dbDateToDateString(new Date('invalid'))).toThrow(RangeError)
  })
})

describe('Prisma の @db.Time との変換', () => {
  it('1970-01-01 の UTC の時刻にする', () => {
    expect(timeStringToDbTime('14:30').toISOString()).toBe('1970-01-01T14:30:00.000Z')
  })

  it.each(['00:00', '09:05', '14:30', '23:59'])('%s を往復しても同じ時刻になる', (time) => {
    expect(dbTimeToTimeString(timeStringToDbTime(time))).toBe(time)
  })

  it('DB から読んだ値（1970-01-01THH:mm:00Z）を時刻にする', () => {
    expect(dbTimeToTimeString(new Date('1970-01-01T09:05:00.000Z'))).toBe('09:05')
  })

  it('不正な値は例外を投げる', () => {
    expect(() => timeStringToDbTime('25:00')).toThrow(RangeError)
    expect(() => dbTimeToTimeString(new Date('invalid'))).toThrow(RangeError)
  })
})
