import 'server-only'

/**
 * 上長の設定が循環しないかの判定（U-06、docs/api.md S-04）。DB にはアクセスしない純粋な関数。
 *
 * 営業 `staffId` の上長を `newManagerId` にしたとき、`newManagerId` から上長をたどって `staffId` に戻ってくるなら循環になる。
 * つまり、自分自身や、自分の配下（部下・部下の部下…）は上長にできない。
 *
 * @param managerOf 営業 ID → その人の上長 ID（いなければ null）。全員分を渡す（営業 200 人程度のため、まとめて読む）
 */
export function wouldCreateManagerCycle(
  staffId: number,
  newManagerId: number,
  managerOf: ReadonlyMap<number, number | null>,
): boolean {
  const visited = new Set<number>()
  let current: number | null | undefined = newManagerId
  while (current !== null && current !== undefined) {
    if (current === staffId) {
      return true
    }
    // 既存のデータが循環していても止まるようにする（本来は起きない）
    if (visited.has(current)) {
      return false
    }
    visited.add(current)
    current = managerOf.get(current)
  }
  return false
}
