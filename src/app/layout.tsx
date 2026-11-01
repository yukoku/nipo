import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import type { ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

import './globals.css'

// 日本語の文字は unicode-range で分割されたファイルが必要な分だけ読み込まれる
const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '営業日報システム',
    template: '%s | 営業日報システム',
  },
  description: '営業担当者の日報（訪問記録・Problem・Plan）を提出し、上長がコメントするシステム',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" className={cn('font-sans antialiased', notoSansJp.variable)}>
      <body>
        {children}
        {/* ライトモードのみで運用するため、OS のダークモード設定に引きずられないよう固定する */}
        <Toaster theme="light" position="top-center" richColors />
      </body>
    </html>
  )
}
