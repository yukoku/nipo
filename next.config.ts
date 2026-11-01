import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cloud Run 向け：.next/standalone に server.js と必要な依存だけを出力し、コンテナを小さくする
  output: 'standalone',
  // レスポンスヘッダーから X-Powered-By: Next.js を外す
  poweredByHeader: false,
  experimental: {
    // 権限のない画面で forbidden() を使い、403 画面（src/app/forbidden.tsx）を出すため（docs/screens.md §3.1）
    authInterrupts: true,
  },
}

export default nextConfig
