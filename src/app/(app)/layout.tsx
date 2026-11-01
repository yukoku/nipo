import type { ReactNode } from 'react'

import { AppHeader } from '@/components/layout/app-header'
import { getCurrentUser } from '@/server/auth/session'

/**
 * ログイン後の画面の共通レイアウト（docs/screens.md §3.1）。ヘッダーと本文の枠を出す。
 *
 * ヘッダーにユーザー名を出すためにログイン中のユーザーを読むだけで、権限はここでは確かめない。
 * 権限は各ページの最初に `requirePageUser()`・`requirePageRole()` で確かめる（決定事項 #28）
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()

  return (
    <div className="flex min-h-svh flex-col">
      {user !== null && <AppHeader user={{ name: user.name, role: user.role }} />}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
