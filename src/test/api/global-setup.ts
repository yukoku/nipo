/**
 * `api` プロジェクトの globalSetup。APIテストを実行する前に 1 回だけ、テスト用DB にマイグレーションを適用する。
 *
 * - 適用済みなら何もしない（`prisma migrate deploy` は未適用のマイグレーションだけを適用する）
 * - globalSetup は Vitest 本体のプロセスで動くため、`test.env` は使われない。ここで .env.test を読み込む
 * - `unit` などのプロジェクトだけを実行するときは動かない（DB を起動していなくてもテストできる）
 */
import { execFileSync } from 'node:child_process'

import { loadEnv } from 'vite'

import { assertTestDatabaseUrl } from './test-database-url'

export default function setup(): void {
  try {
    // .env → .env.test → .env.test.local の順に読み込む（後ろが優先。実行時の環境変数がいちばん優先される）
    const env = loadEnv('test', process.cwd(), '')
    migrate(assertTestDatabaseUrl(env.DATABASE_URL))
  } catch (error) {
    throw withPlainStack(error)
  }
}

function migrate(databaseUrl: string): void {
  try {
    execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
      encoding: 'utf8',
    })
  } catch (error) {
    const output = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error)
    throw new Error(
      [
        'テスト用DB にマイグレーションを適用できませんでした。',
        'PostgreSQL が起動しているか確認してください（docker compose up -d --wait）。',
        '',
        output.trim(),
      ].join('\n'),
    )
  }
}

/**
 * スタックトレースをメッセージだけにした例外にする。
 * globalSetup で投げた例外を Vitest が表示するとき、スタックトレースのソースマップ解析が失敗して
 * 「TypeError: code.charCodeAt is not a function」となり、本来のメッセージが消えてしまうため（Vitest 5.0 / Vite 8.3 で確認）
 */
function withPlainStack(error: unknown): Error {
  const plain = error instanceof Error ? error : new Error(String(error))
  plain.stack = `Error: ${plain.message}`
  return plain
}
