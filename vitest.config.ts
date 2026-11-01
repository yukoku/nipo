import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // tsconfig.json の paths（@/* → src/*）をそのまま使う（Vite 8 の標準機能）
    tsconfigPaths: true,
    alias: {
      // `server-only` はサーバーコンポーネント以外で import すると例外を投げる。
      // テストではサーバー側のコードを直接 import するため、中身が空のファイルに差し替える
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    // 本番（Cloud Run）と同じく UTC で動かし、JST への変換漏れをテストで検出できるようにする
    env: { TZ: 'UTC' },
    projects: [
      {
        test: {
          // 純粋なロジック（権限判定・入力チェック・日付など）
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.api.test.ts'],
        },
      },
      {
        test: {
          // React コンポーネント
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup-component.ts'],
        },
      },
      {
        test: {
          // Route Handler をテスト用DBに対して呼び出す結合テスト（DB の初期化は #15 で追加する）
          name: 'api',
          environment: 'node',
          include: ['src/**/*.api.test.ts'],
          // テスト用DBを共有するため、ファイルを並列に実行しない
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // shadcn/ui が生成する部品と、開発用の画面は対象外
        'src/components/ui/**',
        'src/app/dev/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        // docs/test-spec.md §1.2：権限判定・入力チェックは分岐網羅 100%
        'src/server/authz/**': { branches: 100, perFile: true },
        'src/schemas/**': { branches: 100, perFile: true },
      },
    },
  },
})
