import { describe, expect, it } from 'vitest'

import { TEST_BASE_DATE, setupFixedTime } from './time'

describe('テスト環境のタイムゾーン', () => {
  it('本番（Cloud Run）と同じ UTC で動いている', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC')
    expect(new Date('2026-10-31T00:00:00+09:00').getUTCDate()).toBe(30)
  })
})

describe('setupFixedTime', () => {
  describe('引数なし', () => {
    setupFixedTime()

    it('現在日時が基準日時（2026-10-31 10:00 JST）になる', () => {
      expect(new Date().toISOString()).toBe('2026-10-31T01:00:00.000Z')
      expect(Date.now()).toBe(TEST_BASE_DATE.getTime())
    })
  })

  describe('日時を指定', () => {
    setupFixedTime(new Date('2026-10-31T15:00:00Z'))

    it('指定した日時になる（UTC 15:00 は JST の翌日 0:00）', () => {
      const jstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
      expect(jstDate).toBe('2026-11-01')
    })
  })
})
