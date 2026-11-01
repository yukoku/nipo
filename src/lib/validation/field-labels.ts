/**
 * エラーメッセージに使う項目名の辞書（キーは API の snake_case の項目名）。
 *
 * 項目名はパスの最後の項目名で引く（`visit_records[1].content` なら `content`）。
 * 同じ項目名が API ごとに違う意味を持つ場合（`name` が顧客名・氏名など）は、
 * 入力チェックのときに `labels` で上書きする（`parseJsonBody(request, schema, { labels: { name: '顧客名' } })`）。
 */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  // 認証（docs/api.md §3）
  email: 'メールアドレス',
  password: 'パスワード',

  // 日報（docs/api.md §4）
  report_date: '報告日',
  status: 'ステータス',
  problem: 'Problem',
  plan: 'Plan',
  visit_records: '訪問記録',
  customer_id: '顧客',
  visited_at: '訪問時刻',
  content: '訪問内容',
  date_from: '期間（開始）',
  date_to: '期間（終了）',
  sales_staff_id: '担当者',
  customer_name: '顧客名',

  // コメント（docs/api.md §5）
  target: 'コメント対象',
  body: 'コメント',

  // 顧客マスタ（docs/api.md §6）
  contact_person: '先方担当者',
  phone: '電話番号',
  address: '住所',
  assigned_sales_id: '担当営業',

  // 営業マスタ（docs/api.md §7）
  department: '部署',
  role: '権限',
  manager_id: '上長',

  // 共通
  name: '名前',
  is_active: '状態',
  include_inactive: '無効も表示',
  page: 'ページ番号',
  per_page: '1ページの件数',
}

/** 項目名を辞書で上書きするための指定（キーは snake_case の項目名） */
export type FieldLabels = Readonly<Record<string, string>>

/** パスがない（リクエスト全体の）エラーに使う項目名 */
export const ROOT_LABEL = 'リクエスト'

/**
 * Zod のエラーのパスから、メッセージに使う項目名を決める。
 * 優先順：`overrides` → `FIELD_LABELS` → 項目名そのもの
 */
export function labelForPath(path: readonly PropertyKey[], overrides: FieldLabels = {}): string {
  const key = path.findLast((segment): segment is string => typeof segment === 'string')
  if (key === undefined) {
    return ROOT_LABEL
  }
  return overrides[key] ?? FIELD_LABELS[key] ?? key
}

/**
 * Zod のエラーのパスを、docs/api.md §1.5 の `details[].field` の表記にする。
 * 例：`['visit_records', 1, 'content']` → `visit_records[1].content`
 */
export function formatFieldPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((field, segment) => {
    if (typeof segment === 'number') {
      return `${field}[${segment}]`
    }
    const name = String(segment)
    return field === '' ? name : `${field}.${name}`
  }, '')
}
