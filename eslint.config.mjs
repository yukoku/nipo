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
