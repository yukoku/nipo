import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: {
    default: '営業日報システム',
    template: '%s | 営業日報システム',
  },
  description: '営業担当者の日報（訪問記録・Problem・Plan）を提出し、上長がコメントするシステム',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
