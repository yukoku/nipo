import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CommonPartsSample } from './common-parts-sample'
import { UiSample } from './ui-sample'

export const metadata: Metadata = {
  title: 'UI サンプル',
}

// shadcn/ui の部品の表示・動作を確認するための開発用ページ。本番では 404 にする
export default function UiSamplePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return (
    <>
      <UiSample />
      <CommonPartsSample />
    </>
  )
}
