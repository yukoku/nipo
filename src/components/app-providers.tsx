'use client'

import type { ReactNode } from 'react'

import { ConfirmProvider } from '@/components/confirm-dialog'
import { UnsavedChangesProvider } from '@/components/unsaved-changes'

/** すべての画面で使う Client Component の Provider（確認ダイアログ・未保存の離脱確認） */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
    </ConfirmProvider>
  )
}
