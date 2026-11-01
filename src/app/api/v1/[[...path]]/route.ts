import { NotFoundError } from '@/server/api/errors'
import { withApi } from '@/server/api/with-api'

/**
 * `/api/v1` 配下の、どの API にも当てはまらないパス。
 * Next.js の HTML の 404 ページではなく、docs/api.md §1.5 の形式の JSON で 404 を返す。
 * 個別の API（`src/app/api/v1/reports/route.ts` など）があれば、そちらが優先される
 */
const notFound = withApi(() => {
  throw new NotFoundError('API が見つかりません')
})

export { notFound as DELETE, notFound as GET, notFound as PATCH, notFound as POST, notFound as PUT }
