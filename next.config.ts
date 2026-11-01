import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cloud Run 向け：.next/standalone に server.js と必要な依存だけを出力し、コンテナを小さくする
  output: 'standalone',
  // レスポンスヘッダーから X-Powered-By: Next.js を外す
  poweredByHeader: false,
}

export default nextConfig
