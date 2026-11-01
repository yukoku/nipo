import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // テストデータの投入（`npx prisma db seed`）。src/server/ の `import 'server-only'` を通すため react-server 条件で実行する
    seed: 'tsx --conditions=react-server prisma/seed.ts',
  },
  datasource: {
    // `env('DATABASE_URL')` は未設定だと例外になり、DB に接続しない `prisma generate`（postinstall）まで失敗する。
    // CI や Docker ビルドでは .env がないため、process.env から読む（migrate など DB に接続するコマンドは未設定なら接続エラーになる）
    url: process.env.DATABASE_URL,
  },
})
