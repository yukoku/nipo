import { z } from 'zod'

/**
 * 任意の文字列項目。前後の空白を除き、空文字は `null`（未入力）として保存する。
 * 画面のフォームは未入力の項目を空文字で送るため、`null`・省略・空文字を同じに扱う（決定事項 #30）
 */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)
}
