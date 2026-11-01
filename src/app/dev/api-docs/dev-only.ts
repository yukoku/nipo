/** 開発用のページを表示してよいか（本番では表示しない） */
export function isDevPageEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function notFoundResponse(): Response {
  return new Response('Not Found', { status: 404 })
}
