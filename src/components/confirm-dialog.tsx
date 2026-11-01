'use client'

import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ConfirmOptions } from '@/lib/messages'

/** 確認ダイアログを出し、「実行する」なら true、「やめる」・閉じたなら false で終わる */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * 確認ダイアログ（M-06〜M-08・M-11・M-12）を、どの画面からでも 1 行で出せるようにする。
 * ルートのレイアウト（`AppProviders`）で 1 回だけ置く
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // 閉じるアニメーションの間も文言を表示し続けるため、閉じても options は消さない
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((result: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((next) => {
    // 前のダイアログが開いたままなら「やめる」として終わらせる
    resolveRef.current?.(false)
    setOptions(next)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const finish = useCallback((result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOpen(false)
  }, [])

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Esc キー・枠の外のクリックで閉じたときは「やめる」
          if (!next) finish(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description !== undefined && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>{options?.cancelLabel ?? 'キャンセル'}</AlertDialogCancel>
            <AlertDialogAction variant={options?.destructive ? 'destructive' : 'default'} onClick={() => finish(true)}>
              {options?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext>
  )
}

/**
 * 確認ダイアログを出す関数を返す
 *
 * @example
 * const confirm = useConfirm()
 * if (await confirm(CONFIRM_MESSAGES.submitReport)) { ...提出する }
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (confirm === null) {
    throw new Error('useConfirm() は ConfirmProvider の中で使ってください')
  }
  return confirm
}
