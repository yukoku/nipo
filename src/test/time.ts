import { afterEach, beforeEach, vi } from 'vitest'

/**
 * テストの基準日時（docs/test-spec.md §2.1）。2026-10-31（土）JST の 10:00
 */
export const TEST_BASE_DATE = new Date('2026-10-31T10:00:00+09:00')

/**
 * describe の中（またはファイルの先頭）で呼ぶと、各テストの間だけ現在日時を固定する。
 *
 * Date だけを差し替え、setTimeout などのタイマーは本物のまま動かす
 * （user-event やトーストなど、タイマーに依存する処理を止めないため）。
 *
 * @example
 * describe('日報の未来日チェック', () => {
 *   setupFixedTime()                                       // 2026-10-31 10:00 JST に固定
 *   setupFixedTime(new Date('2026-10-31T23:59:00+09:00'))  // 任意の日時に固定
 * })
 */
export function setupFixedTime(date: Date = TEST_BASE_DATE): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(date)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
