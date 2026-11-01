'use client'

import { useRouter } from 'next/navigation'
import type { ComponentProps, MouseEvent } from 'react'

import { TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * クリックすると `href` へ移動する表の行（一覧の「行クリック」。docs/screens.md SC-02・SC-05・SC-07）。
 *
 * キーボードや読み上げでも移動できるよう、行の中の 1 列目などに同じ `href` のリンクを必ず置く（行そのものはフォーカスできない）。
 * 行の中のリンク・ボタンを押したときは、そちらの動作を優先する。Ctrl・⌘ キーを押しながらのクリックは新しいタブで開く
 */
export function LinkRow({ href, className, onClick, ...props }: ComponentProps<typeof TableRow> & { href: string }) {
  const router = useRouter()

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event)
    if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('a, button, input, select, textarea'))) {
      return
    }
    if (event.metaKey || event.ctrlKey) {
      window.open(href, '_blank', 'noopener')
      return
    }
    router.push(href)
  }

  return <TableRow {...props} onClick={handleClick} className={cn('cursor-pointer', className)} />
}
