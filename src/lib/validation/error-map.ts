import type { z } from 'zod'

import { type FieldLabels, labelForPath } from '@/lib/validation/field-labels'

type Issue = Parameters<z.core.$ZodErrorMap>[0]

/**
 * Zod のエラーメッセージを日本語にするエラーマップ（docs/screens.md §5 の M-02・M-03 に合わせる）。
 *
 * API の入力チェック（`@/server/api/validation`）と画面のフォームの両方で使う。
 * スキーマ側で `message` を指定した場合は、そちらが優先される（Zod の仕様）。
 *
 * @example
 * schema.safeParse(input, { error: createErrorMap({ name: '顧客名' }) })
 * useForm({ resolver: zodResolver(schema, { error: createErrorMap() }) })
 */
export function createErrorMap(labels: FieldLabels = {}): z.core.$ZodErrorMap {
  return (issue) => messageFor(issue, labelForPath(issue.path ?? [], labels))
}

function messageFor(issue: Issue, label: string): string {
  switch (issue.code) {
    case 'invalid_type':
      return invalidTypeMessage(issue, label)
    case 'too_small':
      return tooSmallMessage(issue, label)
    case 'too_big':
      return tooBigMessage(issue, label)
    case 'invalid_format':
      return `${label}の形式が正しくありません`
    case 'unrecognized_keys':
      return `${label}に不明な項目（${issue.keys.join('、')}）が含まれています`
    default:
      return `${label}の値が正しくありません`
  }
}

function invalidTypeMessage(issue: Extract<Issue, { code: 'invalid_type' }>, label: string): string {
  // 項目がない（undefined）・null は「必須」として扱う（M-02）
  if (issue.input === undefined || issue.input === null) {
    return `${label}は必須です`
  }
  switch (issue.expected) {
    case 'int':
      return `${label}は整数で入力してください`
    case 'number':
      return `${label}は数値で入力してください`
    default:
      return `${label}の形式が正しくありません`
  }
}

function tooSmallMessage(issue: Extract<Issue, { code: 'too_small' }>, label: string): string {
  const min = Number(issue.minimum)
  switch (issue.origin) {
    case 'string':
      // `.min(1)`（空文字の禁止）は「必須」として扱う（M-02）
      return min <= 1 ? `${label}は必須です` : `${label}は${min}文字以上で入力してください`
    case 'array':
      return `${label}は${min}件以上入力してください`
    case 'number':
    case 'int':
      return issue.inclusive === false
        ? `${label}は${min}より大きい値で入力してください`
        : `${label}は${min}以上で入力してください`
    default:
      return `${label}の値が正しくありません`
  }
}

function tooBigMessage(issue: Extract<Issue, { code: 'too_big' }>, label: string): string {
  const max = Number(issue.maximum)
  switch (issue.origin) {
    case 'string':
      // M-03
      return `${label}は${max}文字以内で入力してください`
    case 'array':
      return `${label}は${max}件以内で入力してください`
    case 'number':
    case 'int':
      return issue.inclusive === false
        ? `${label}は${max}より小さい値で入力してください`
        : `${label}は${max}以下で入力してください`
    default:
      return `${label}の値が正しくありません`
  }
}
