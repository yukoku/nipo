import 'server-only'

import type { PoolConfig } from 'pg'

/** 1 インスタンスあたりの接続数の上限の既定値（node-postgres の既定値と同じ） */
export const DEFAULT_POOL_MAX = 10

/**
 * 環境変数から PostgreSQL の接続プール設定を作る。
 *
 * - `DATABASE_URL`：接続文字列（必須）
 * - `DATABASE_POOL_MAX`：1 インスタンスあたりの接続数の上限（任意、既定 10）。
 *   Cloud Run の最大インスタンス数 × この値が Cloud SQL の接続上限（max_connections）を超えないように設定する
 */
export function buildPoolConfig(env: Record<string, string | undefined>): PoolConfig {
  const connectionString = env.DATABASE_URL
  if (!connectionString) {
    throw new Error('環境変数 DATABASE_URL が設定されていません')
  }

  return { connectionString, max: parsePoolMax(env.DATABASE_POOL_MAX) }
}

function parsePoolMax(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_POOL_MAX
  }
  // "10abc" や "1.5" を通さないよう、数字だけで構成されているかを確かめてから変換する
  const max = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new Error(`環境変数 DATABASE_POOL_MAX は 1 以上の整数で指定してください（現在の値：${value}）`)
  }
  return max
}
