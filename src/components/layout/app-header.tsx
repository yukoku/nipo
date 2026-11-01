'use client'

import { ChevronDown, LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

import { useConfirmLeave } from '@/components/unsaved-changes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Role } from '@/generated/prisma/client'
import { ApiClientError, api, setCsrfToken } from '@/lib/api-client'
import { ERROR_MESSAGES } from '@/lib/messages'
import { notifyError } from '@/lib/notify'
import { LOGIN_PATH, isNavItemActive, navItemsForRole } from '@/lib/routes'
import { cn } from '@/lib/utils'

export interface HeaderUser {
  name: string
  role: Role
}

/**
 * 共通ヘッダー（docs/screens.md §3.1、T-UI-03）
 * - システム名・ロールごとのメニュー（営業・上長は日報一覧、管理者は顧客・営業）・ログインユーザー名のメニュー（ログアウト）
 * - スマートフォン幅では、メニューを「≡」ボタンの中に折りたたむ
 */
export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const confirmLeave = useConfirmLeave()
  const [loggingOut, setLoggingOut] = useState(false)
  const navItems = navItemsForRole(user.role)

  async function logout() {
    // 入力中の画面があれば、移動してよいか確かめる（M-07）
    if (!(await confirmLeave())) {
      return
    }
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
    } catch (error) {
      // セッションが既に切れている（401）ならログアウト済みとして扱う
      if (!(error instanceof ApiClientError && error.status === 401)) {
        notifyError(ERROR_MESSAGES.logoutFailed)
        setLoggingOut(false)
        return
      }
    }
    setCsrfToken(null)
    router.replace(LOGIN_PATH)
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:gap-6">
        {/* スマートフォン幅のメニュー */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="メニューを開く">
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {navItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} aria-current={isNavItemActive(item, pathname) ? 'page' : undefined}>
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Link href="/" className="font-bold whitespace-nowrap">
          営業日報システム
        </Link>

        <nav aria-label="メインメニュー" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = isNavItemActive(item, pathname)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      active && 'bg-muted text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="max-w-48" aria-label={`${user.name}のメニュー`}>
                <span className="truncate">{user.name}</span>
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={loggingOut} onSelect={() => void logout()}>
                <LogOut aria-hidden />
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
