import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * すべての画面（page.tsx）が、最初に認証・認可を確かめていることを確認する。
 *
 * proxy（src/proxy.ts）は Cookie があるかしか見ないため、ページで `requirePageUser()`・`requirePageRole()` を呼び忘れると、
 * 期限切れのセッションや権限のないロールでも画面が表示されてしまう。新しい画面を足したときの呼び忘れを、ここで見つける
 */

const APP_DIR = join(import.meta.dirname)

/** 認証なしで開ける画面（ログイン画面と、本番では 404 になる開発用の画面） */
const PUBLIC_PAGES = new Set(['login/page.tsx', 'dev/ui-sample/page.tsx'])

function findPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return findPages(path)
    }
    return entry.name === 'page.tsx' ? [relative(APP_DIR, path).replaceAll('\\', '/')] : []
  })
}

describe('画面のアクセス制御の呼び忘れ防止', () => {
  const pages = findPages(APP_DIR).filter((page) => !PUBLIC_PAGES.has(page))

  it('認証が必要な画面がある', () => {
    expect(pages).toContain('page.tsx')
  })

  it('認証が必要な画面は、すべて requirePageUser() か requirePageRole() を呼んでいる', () => {
    const missing = pages.filter((page) => !/\brequirePage(User|Role)\(/.test(readFileSync(join(APP_DIR, page), 'utf8')))

    expect(missing).toEqual([])
  })
})
