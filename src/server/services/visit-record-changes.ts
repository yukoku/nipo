import 'server-only'

/**
 * 日報更新（R-04）の訪問記録の差分（U-05、docs/api.md R-04）。DB にはアクセスしない純粋な関数。
 *
 * 送られてきた行は全件置き換えとして扱う。
 * - `id` あり：既存の行を更新する
 * - `id` なし：新しい行として追加する
 * - 既存の行のうち、送られてこなかったもの：削除する
 * - `sort_order` は、送られてきた順に 1 から振り直す
 *
 * `id` がこの日報の訪問記録でない（他の日報の行・存在しない行）ときは、その行の位置を `unknownIdIndexes` に入れる（400 にする。T-RPT-68）
 */

/** 送られてきた訪問記録の 1 行 */
export interface IncomingVisitRecord<T> {
  id?: number
  data: T
}

export interface VisitRecordChanges<T> {
  updates: { id: number; data: T; sortOrder: number }[]
  creates: { data: T; sortOrder: number }[]
  deleteIds: number[]
  /** この日報の訪問記録ではない `id` が送られてきた行の位置（0 始まり） */
  unknownIdIndexes: number[]
}

export function planVisitRecordChanges<T>(
  existingIds: readonly number[],
  incoming: readonly IncomingVisitRecord<T>[],
): VisitRecordChanges<T> {
  const existing = new Set(existingIds)
  const kept = new Set<number>()
  const changes: VisitRecordChanges<T> = { updates: [], creates: [], deleteIds: [], unknownIdIndexes: [] }

  incoming.forEach((record, index) => {
    const sortOrder = index + 1
    if (record.id === undefined) {
      changes.creates.push({ data: record.data, sortOrder })
    } else if (existing.has(record.id)) {
      changes.updates.push({ id: record.id, data: record.data, sortOrder })
      kept.add(record.id)
    } else {
      changes.unknownIdIndexes.push(index)
    }
  })
  changes.deleteIds = existingIds.filter((id) => !kept.has(id))
  return changes
}
