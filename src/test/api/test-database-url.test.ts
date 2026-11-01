import { describe, expect, it } from 'vitest'

import { assertTestDatabaseUrl } from './test-database-url'

describe('assertTestDatabaseUrl', () => {
  it.each([
    'postgresql://nipo:nipo@localhost:55432/nipo_test',
    'postgresql://user:pass@db.example.com:5432/app_test?schema=public',
  ])('DB 名が _test で終わる接続先はそのまま返す（%s）', (url) => {
    expect(assertTestDatabaseUrl(url)).toBe(url)
  })

  it.each([
    ['開発用DB', 'postgresql://nipo:nipo@localhost:55432/nipo_dev'],
    ['名前の途中に test を含むだけ', 'postgresql://nipo:nipo@localhost:55432/nipo_test_backup'],
    ['DB 名なし', 'postgresql://nipo:nipo@localhost:55432'],
  ])('%s の接続先は例外にする', (_label, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow('テスト用DB でしか実行できません')
  })

  it('エラーメッセージにパスワードを含めない', () => {
    expect(() => assertTestDatabaseUrl('postgresql://nipo:secret-password@localhost:5432/nipo_dev')).toThrow(
      /^(?!.*secret-password).*$/s,
    )
  })

  it('未設定・空文字は例外にする', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow('DATABASE_URL が設定されていません')
    expect(() => assertTestDatabaseUrl('')).toThrow('DATABASE_URL が設定されていません')
  })

  it('URL として解釈できない値は例外にする', () => {
    expect(() => assertTestDatabaseUrl('not a url')).toThrow('DATABASE_URL の形式が正しくありません')
  })
})
