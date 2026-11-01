import { z } from 'zod'

/** パスワードの最小・最大の文字数（docs/api.md S-02、決定事項 #25） */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20

/** 英字と数字をそれぞれ 1 文字以上含まないときのメッセージ */
export const PASSWORD_CHARACTER_MESSAGE = 'パスワードは英字と数字をそれぞれ1文字以上含めてください'

/**
 * パスワードポリシー（docs/api.md S-02・S-04、docs/screens.md SC-08）。
 *
 * - 8 文字以上、20 文字以内
 * - 英字（A〜Z・a〜z）と数字（0〜9）をそれぞれ 1 文字以上含む
 * - 記号・空白など、それ以外の文字も使える
 *
 * 営業の登録（S-02）・更新（S-04）とシードデータ（#14）で使う。ログイン（A-01）では使わない
 * （ポリシーを後から変えても、古いパスワードでログインできるようにするため）
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .regex(/[A-Za-z]/, PASSWORD_CHARACTER_MESSAGE)
  .regex(/[0-9]/, PASSWORD_CHARACTER_MESSAGE)
  .meta({
    description: `${PASSWORD_MIN_LENGTH}〜${PASSWORD_MAX_LENGTH} 文字。英字と数字をそれぞれ 1 文字以上含む`,
    example: 'Passw0rd',
  })
