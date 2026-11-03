import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { registerApi } from '@/openapi/registry'
import { commentCreateRequestSchema, commentUpdateRequestSchema } from '@/schemas/comment'
import { idParamsSchema } from '@/schemas/id'
import { commentSchema } from '@/schemas/report'
import { dataResponseSchema } from '@/schemas/response'

const TAG = 'コメント'

/** コメント API（docs/api.md §5）。Route Handler：src/app/api/v1/reports/[id]/comments/route.ts・comments/[id]/route.ts */
export function registerCommentApis(registry: OpenAPIRegistry): void {
  registerApi(registry, {
    method: 'post',
    path: '/reports/{id}/comments',
    id: 'C-01',
    summary: 'コメント投稿',
    description: [
      '日報を書いた人の直属の上長だけが、提出済みの日報にコメントできる。',
      '日報がない・閲覧できないときは 404、閲覧はできるがコメントできない（日報を書いた本人など）ときは 403。',
      '本文は 1,000 文字以内で、空白だけは不可。日報の行をロックしてから作成する（日報の更新と同時に起きても、コメントの付いた日報が書き換わらない）。',
      '`Location` ヘッダーに作成したコメントの URL を付ける',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema, body: commentCreateRequestSchema },
    errors: [404],
    response: { status: 201, description: '作成したコメント', schema: dataResponseSchema(commentSchema) },
  })

  registerApi(registry, {
    method: 'put',
    path: '/comments/{id}',
    id: 'C-02',
    summary: 'コメント更新',
    description: [
      '投稿した本人だけ。target は変えられない（送られても無視する）。',
      'コメントがない・コメントの付いた日報を閲覧できないときは 404、投稿者以外は 403',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema, body: commentUpdateRequestSchema },
    errors: [404],
    response: { status: 200, description: '更新後のコメント', schema: dataResponseSchema(commentSchema) },
  })

  registerApi(registry, {
    method: 'delete',
    path: '/comments/{id}',
    id: 'C-03',
    summary: 'コメント削除',
    description: [
      '投稿した本人だけ。物理削除する。コメントが 0 件になった日報は、また編集できるようになる。',
      'コメントがない・コメントの付いた日報を閲覧できないときは 404、投稿者以外は 403',
    ].join(''),
    tag: TAG,
    request: { params: idParamsSchema },
    errors: [404],
    response: { status: 204, description: '削除した' },
  })
}
