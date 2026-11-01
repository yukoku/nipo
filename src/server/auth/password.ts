import 'server-only'

import { hash, parseOptions, verify } from '@node-rs/argon2'

/**
 * パスワードのハッシュ化（Argon2id）。
 *
 * パラメーターは OWASP Password Storage Cheat Sheet の Argon2id の推奨値（m=19 MiB, t=2, p=1）。
 * 1 回の計算で約 19 MiB のメモリを使う。強さを変えるときはここを直す。古いパラメーターの
 * ハッシュは `needsRehash()` で見分け、ログイン成功時に作り直す（#18）
 *
 * アルゴリズムは指定せず、@node-rs/argon2 の既定（Argon2id）を使う
 * （`Algorithm` は const enum のため、このプロジェクトの設定（isolatedModules）では参照できない）
 */
const HASH_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * 存在しないユーザー・無効なユーザーのログインでも、本物と同じだけ時間をかけるための
 * ダミーのハッシュ（応答時間の差からアカウントの有無を推測させない。決定事項 #18）
 */
let dummyHash: Promise<string> | undefined

/** パスワードをハッシュ化する。結果は PHC 形式の文字列（`$argon2id$v=19$m=19456,t=2,p=1$...`）で、ソルトを含む */
export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS)
}

/**
 * パスワードがハッシュと一致するか確かめる。
 *
 * - `passwordHash` が `null`（ユーザーが存在しない・無効など）でも、ダミーのハッシュで同じ計算をしてから `false` を返す
 * - ハッシュの形式が壊れている場合も、例外にせず `false` を返す
 */
export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (passwordHash === null) {
    dummyHash ??= hashPassword('dummy-password-for-timing')
    await verifySafely(await dummyHash, password)
    return false
  }
  return verifySafely(passwordHash, password)
}

/** ハッシュのパラメーターが今の設定より古いか（Argon2id 以外・強さが違う場合は true） */
export function needsRehash(passwordHash: string): boolean {
  try {
    const options = parseOptions(passwordHash)
    return (
      !passwordHash.startsWith('$argon2id$') ||
      options.memoryCost !== HASH_OPTIONS.memoryCost ||
      options.timeCost !== HASH_OPTIONS.timeCost ||
      options.parallelism !== HASH_OPTIONS.parallelism
    )
  } catch {
    return true
  }
}

async function verifySafely(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}
