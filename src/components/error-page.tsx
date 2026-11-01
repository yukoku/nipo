import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  icon: LucideIcon
  /** HTTP ステータス（403・404 など） */
  status: number
  title: string
  description: string
}

/**
 * 403・404 などのエラー画面の共通部品。トップ画面（ロールごとの画面へ振り分ける）へ戻るボタンを出す
 */
export function ErrorPage({ icon: Icon, status, title, description }: ErrorPageProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <Icon aria-hidden className="size-12 text-muted-foreground" />
      <p className="text-sm font-medium text-muted-foreground">{status}</p>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="max-w-md text-muted-foreground">{description}</p>
      <Button asChild>
        <Link href="/">トップ画面へ戻る</Link>
      </Button>
    </main>
  )
}
