import vitest from '@vitest/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  // Next.js 推奨ルール（React / React Hooks / Core Web Vitals）
  ...nextVitals,
  // TypeScript 用ルール（@typescript-eslint/recommended ベース）
  ...nextTs,

  // プロジェクト独自のルール
  {
    rules: {
      // 未使用変数はエラー。ただし `_` 始まりは意図的な未使用として許可
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 型のみの import は `import type` に統一
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // any の使用は警告
      '@typescript-eslint/no-explicit-any': 'warn',
      // console.log の消し忘れを防ぐ（warn / error は許可）
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // 厳密等価を強制（`== null` のみ許可）
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // 再代入しない変数は const
      'prefer-const': 'error',
      // App Router 構成で pages/ ディレクトリを使わないため無効化
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // shadcn/ui が生成する部品。`npx shadcn add` で上書き更新するため手で直さず、書き方のルールだけ緩める
  {
    files: ['src/components/ui/**'],
    rules: {
      eqeqeq: 'off',
    },
  },

  // テストファイル：Vitest の推奨ルール（expect のないテスト、focus したままのテストなどを検出）
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // .only の消し忘れで他のテストが実行されなくなるのを防ぐ
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
    },
  },

  // 除外対象
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'generated/**',
  ]),
])

export default eslintConfig
