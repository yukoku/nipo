import type { Metadata } from 'next'

import { redirectIfAuthenticated } from '@/server/auth/page-auth'

export const metadata: Metadata = { title: 'ログイン' }

// 仮のログイン画面。入力フォームは #22 で作る
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  // ログイン済みなら、戻り先かロールごとのトップ画面へ移る
  await redirectIfAuthenticated(next)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 px-4">
      <h1 className="text-2xl font-bold">営業日報システム</h1>
      <p className="text-muted-foreground">ログイン画面は準備中です。</p>
    </main>
  )
}
