/**
 * 一覧画面の URL のクエリ（検索条件・ページ番号）を扱う関数（サーバー・ブラウザの両方で使う）
 *
 * 検索条件は URL のクエリに保持する（docs/screens.md SC-02・SC-05 など）。再読み込み・ブックマーク・「戻る」で条件が残るようにするため
 */

/** Next.js のページが受け取る `searchParams` の形 */
export type SearchParamsRecord = Record<string, string | string[] | undefined>

export type QueryValues = Record<string, string | number | boolean | null | undefined>

/**
 * クエリ文字列（`?` を含む）を作る。空文字・`null`・`undefined`・`false`・ページ番号 1 は付けない（URL を短くし、初期値と同じ意味にするため）。
 * 付けるものがなければ空文字を返す
 */
export function buildQueryString(values: QueryValues): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '' || value === false) {
      continue
    }
    if (key === 'page' && Number(value) === 1) {
      continue
    }
    params.set(key, String(value))
  }
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/** `searchParams` を、値が文字列 1 つずつのオブジェクトにする（同じ名前が複数あれば最初の値を使う） */
export function firstValues(searchParams: SearchParamsRecord): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) {
      result[key] = first
    }
  }
  return result
}

/** ページ送りに並べる項目。数字はページ番号、`'ellipsis'` は省略（…） */
export type PageItem = number | 'ellipsis'

/**
 * ページ送りに並べるページ番号を決める。最初・最後のページと、今のページの前後 1 ページを出し、間は「…」にする。
 * 例：全 10 ページで 5 ページ目 → 1 … 4 5 6 … 10
 */
export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages))
  const sorted = [...pages].sort((a, b) => a - b)
  const items: PageItem[] = []
  for (const [index, p] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && p - previous > 1) {
      items.push('ellipsis')
    }
    items.push(p)
  }
  return items
}
