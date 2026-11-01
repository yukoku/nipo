import type { Metadata } from 'next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/login-form'
import { redirectIfAuthenticated } from '@/server/auth/page-auth'

export const metadata: Metadata = { title: 'ログイン' }

/** ログイン画面（SC-01） */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  // ログイン済みなら、戻り先かロールごとのトップ画面へ移る
  await redirectIfAuthenticated(next)

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-center text-xl font-bold">営業日報システム</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={typeof next === 'string' ? next : undefined} />
        </CardContent>
      </Card>
    </main>
  )
}
