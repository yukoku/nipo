import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `env('DATABASE_URL')` は未設定だと例外になり、DB に接続しない `prisma generate`（postinstall）まで失敗する。
    // CI や Docker ビルドでは .env がないため、process.env から読む（migrate など DB に接続するコマンドは未設定なら接続エラーになる）
    url: process.env.DATABASE_URL,
  },
})
