'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'

import { useConfirm } from '@/components/confirm-dialog'
import { CONFIRM_MESSAGES } from '@/lib/messages'

/**
 * 未保存のまま画面を離れるときの確認（M-07、docs/screens.md §3.2）
 *
 * - ブラウザを閉じる・再読み込み・別のサイトへ移動：`beforeunload` でブラウザの確認を出す（文言はブラウザが決める）
 * - アプリ内のリンク（ヘッダーのメニューなど）：App Router には画面を移動する前のイベントがないため、
 *   document でリンクのクリックを先に捕まえて止め、確認ダイアログ（M-07）で「移動する」を選んだら移動する
 * - ボタンなどからコードで移動する場合（キャンセルボタン・ログアウト）：`confirmLeave()` を呼んで確かめてから移動する
 * - ブラウザの「戻る」ボタンには対応しない（App Router で止める方法がないため。決定事項 #29）
 */

interface UnsavedChangesContextValue {
  setDirty: (id: string, dirty: boolean) => void
  confirmLeave: () => Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

/** ルートのレイアウト（`AppProviders`）で 1 回だけ置く。`ConfirmProvider` の中に置く */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const confirm = useConfirm()
  const router = useRouter()
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set())
  const dirty = dirtyIds.size > 0
  const dirtyRef = useRef(dirty)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const setDirty = useCallback((id: string, next: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === next) {
        return prev
      }
      const updated = new Set(prev)
      if (next) {
        updated.add(id)
      } else {
        updated.delete(id)
      }
      return updated
    })
  }, [])

  const confirmLeave = useCallback(
    async () => !dirtyRef.current || confirm(CONFIRM_MESSAGES.leaveUnsaved),
    [confirm],
  )

  useEffect(() => {
    if (!dirty) {
      return
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // 古いブラウザは returnValue の設定が必要
      event.returnValue = ''
    }
    function onClick(event: MouseEvent) {
      const href = guardedLinkHref(event)
      if (href === null) {
        return
      }
      // Next.js の Link より先に止める（document のキャプチャで捕まえるので、Link の onClick より先に動く）
      event.preventDefault()
      event.stopPropagation()
      void confirm(CONFIRM_MESSAGES.leaveUnsaved).then((ok) => {
        if (ok) {
          router.push(href)
        }
      })
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, confirm, router])

  const value = useMemo(() => ({ setDirty, confirmLeave }), [setDirty, confirmLeave])
  return <UnsavedChangesContext value={value}>{children}</UnsavedChangesContext>
}

/**
 * クリックがアプリ内の別の画面へのリンクなら、移動先（パス・クエリ・ハッシュ）を返す。止めなくてよいクリックなら null。
 * 新しいタブで開く・別のサイト・同じ画面の中のリンクは止めない（別のサイトへの移動は beforeunload で確かめる）
 */
export function guardedLinkHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null
  }
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) {
    return null
  }
  if (anchor.target !== '' && anchor.target !== '_self') {
    return null
  }
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) {
    return null
  }
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null
  }
  return `${url.pathname}${url.search}${url.hash}`
}

function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const value = useContext(UnsavedChangesContext)
  if (value === null) {
    throw new Error('UnsavedChangesProvider の中で使ってください')
  }
  return value
}

/**
 * 入力中（`when` が true）の間、画面を離れるときに確認を出す。戻り値の `confirmLeave()` は、
 * キャンセルボタンなどコードで移動する前に呼ぶ（未保存なら確認ダイアログを出し、移動してよければ true）
 *
 * @example
 * const { confirmLeave } = useUnsavedChangesGuard(form.formState.isDirty && !form.formState.isSubmitSuccessful)
 * async function onCancel() {
 *   if (await confirmLeave()) router.push('/customers')
 * }
 */
export function useUnsavedChangesGuard(when: boolean): { confirmLeave: () => Promise<boolean> } {
  const { setDirty, confirmLeave } = useUnsavedChangesContext()
  const id = useId()

  useEffect(() => {
    setDirty(id, when)
    return () => setDirty(id, false)
  }, [setDirty, id, when])

  return { confirmLeave }
}

/** 未保存の入力があれば確認ダイアログを出す関数を返す（ヘッダーのログアウトなど、フォームの外から移動するときに使う） */
export function useConfirmLeave(): () => Promise<boolean> {
  return useUnsavedChangesContext().confirmLeave
}
