import { describe, expect, it } from 'vitest'

import { commentSchema } from '@/schemas/report'
import { dataResponseSchema } from '@/schemas/response'
import { prisma } from '@/server/db/prisma'
import { SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'
import { loginAs, type SeedStaffKey } from '@/test/api/auth'
import { callRoute } from '@/test/api/route'
import { setupFixedTime } from '@/test/time'

import { GET as getReport, PUT as putReport } from '../reports/[id]/route'
import { POST as postComment } from '../reports/[id]/comments/route'
import { DELETE as deleteComment, PUT as putComment } from './[id]/route'

type Comment = {
  id: number
  target: 'problem' | 'plan'
  body: string
  commenter: { id: number; name: string }
  created_at: string
  updated_at: string
}
type Body<T> = { data: T; error?: { code: string; reason?: string; details?: { field: string; message: string }[] } }

/** 101：山田・提出済み・コメントなし */
const SUBMITTED_ID = SEED_REPORTS.submitted.id
/** 100 に付いている鈴木のコメント（Problem） */
const SEED_COMMENT = SEED_REPORTS.commented.comments[0]!

async function postAs(staff: SeedStaffKey, reportId: number | string, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<Body<Comment>>(postComment, `/api/v1/reports/${reportId}/comments`, {
    method: 'POST',
    params: { id: String(reportId) },
    body,
    headers,
  })
}

async function putAs(staff: SeedStaffKey, id: number | string, body: unknown) {
  const { headers } = await loginAs(staff)
  return callRoute<Body<Comment>>(putComment, `/api/v1/comments/${id}`, {
    method: 'PUT',
    params: { id: String(id) },
    body,
    headers,
  })
}

async function deleteAs(staff: SeedStaffKey, id: number | string) {
  const { headers } = await loginAs(staff)
  return callRoute<Body<null>>(deleteComment, `/api/v1/comments/${id}`, {
    method: 'DELETE',
    params: { id: String(id) },
    headers,
  })
}

async function commentsOf(staff: SeedStaffKey, reportId: number) {
  const { headers } = await loginAs(staff)
  const response = await callRoute<Body<{ comments: Comment[] }>>(getReport, `/api/v1/reports/${reportId}`, {
    params: { id: String(reportId) },
    headers,
  })
  return response.body.data.comments
}

const countComments = (reportId: number) => prisma.comment.count({ where: { dailyReportId: reportId } })

describe('POST /api/v1/reports/{id}/comments（C-01）', () => {
  setupFixedTime() // 2026-10-31 10:00 JST

  it('T-CMT-01: 直属の上長が提出済みの日報の Problem にコメントすると 201、commenter は鈴木', async () => {
    const response = await postAs('suzuki', SUBMITTED_ID, { target: 'problem', body: '  5%までなら即決OK。  ' })

    expect(response.status).toBe(201)
    expect(dataResponseSchema(commentSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({
      target: 'problem',
      body: '5%までなら即決OK。',
      commenter: { id: SEED_STAFF.suzuki.id, name: '鈴木一郎' },
      created_at: '2026-10-31T10:00:00+09:00',
      updated_at: '2026-10-31T10:00:00+09:00',
    })
    expect(response.headers.get('location')).toBe(`/api/v1/comments/${response.body.data.id}`)
  })

  it('T-CMT-02: Plan にもコメントできる', async () => {
    const response = await postAs('suzuki', SUBMITTED_ID, { target: 'plan', body: '資料は先に私にも送って' })

    expect(response.status).toBe(201)
    expect(response.body.data.target).toBe('plan')
  })

  it('T-CMT-03: 同じ項目に複数コメントでき、詳細取得で 2 件返る', async () => {
    await postAs('suzuki', SUBMITTED_ID, { target: 'problem', body: '1件目' })
    const second = await postAs('suzuki', SUBMITTED_ID, { target: 'problem', body: '2件目' })

    expect(second.status).toBe(201)
    const comments = await commentsOf('yamada', SUBMITTED_ID)
    expect(comments.map((comment) => [comment.target, comment.body])).toEqual([
      ['problem', '1件目'],
      ['problem', '2件目'],
    ])
  })

  it.each<[string, SeedStaffKey, number]>([
    ['T-CMT-04: 他チームの上長', 'tanaka', SUBMITTED_ID],
    ['T-CMT-06: 同僚', 'sato', SUBMITTED_ID],
    ['T-CMT-07: 部下の下書き', 'suzuki', SEED_REPORTS.satoDraft.id],
    ['存在しない日報', 'suzuki', 9999],
    ['数字でない ID', 'suzuki', Number.NaN],
    ['管理者', 'admin', SUBMITTED_ID],
  ])('%s は 404 で、コメントは増えない', async (_case, staff, reportId) => {
    const response = await postAs(staff, Number.isNaN(reportId) ? 'abc' : reportId, { target: 'problem', body: 'OK' })

    expect(response.status).toBe(404)
    expect(response.body.error?.code).toBe('NOT_FOUND')
    expect(await prisma.comment.count({ where: { commenterId: SEED_STAFF[staff].id, body: 'OK' } })).toBe(0)
  })

  it('T-CMT-05: 日報を書いた本人は 403（閲覧はできるがコメントできない）', async () => {
    const response = await postAs('yamada', SUBMITTED_ID, { target: 'problem', body: '自分でコメント' })

    expect(response.status).toBe(403)
    expect(await countComments(SUBMITTED_ID)).toBe(0)
  })

  it('T-CMT-08: target が problem・plan 以外なら 400', async () => {
    const response = await postAs('suzuki', SUBMITTED_ID, { target: 'other', body: 'OK' })

    expect(response.status).toBe(400)
    expect(response.body.error?.details?.map((detail) => detail.field)).toEqual(['target'])
  })

  it.each(['', '   '])('T-CMT-09: 本文が %j なら 400（必須）', async (body) => {
    const response = await postAs('suzuki', SUBMITTED_ID, { target: 'problem', body })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'body', message: 'コメントは必須です' }])
  })

  it('T-CMT-10: 本文は 1,000 文字なら 201、1,001 文字なら 400', async () => {
    expect((await postAs('suzuki', SUBMITTED_ID, { target: 'plan', body: 'あ'.repeat(1000) })).status).toBe(201)

    const tooLong = await postAs('suzuki', SUBMITTED_ID, { target: 'plan', body: 'あ'.repeat(1001) })
    expect(tooLong.status).toBe(400)
    expect(tooLong.body.error?.details).toEqual([
      { field: 'body', message: 'コメントは1000文字以内で入力してください' },
    ])
  })

  it('T-CMT-11: コメントが付いた日報は、本人が更新すると 409 REPORT_LOCKED', async () => {
    await postAs('suzuki', SUBMITTED_ID, { target: 'problem', body: '確認しました' })
    const { headers } = await loginAs('yamada')

    const response = await callRoute<Body<unknown>>(putReport, `/api/v1/reports/${SUBMITTED_ID}`, {
      method: 'PUT',
      params: { id: String(SUBMITTED_ID) },
      body: { status: 'submitted', problem: '書き換え', plan: '資料送付', visit_records: [] },
      headers,
    })

    expect(response.status).toBe(409)
    expect(response.body.error?.reason).toBe('REPORT_LOCKED')
  })

  it('日報の行がロックされている間は待ち、ロックが外れた後の日報の状態で判定する（決定事項 #15）', async () => {
    let post: ReturnType<typeof postAs> | undefined

    // 日報の行をロックしている間にコメントの投稿を始め、その間に日報が下書きになった（コメントできなくなった）とする。
    // 投稿がロックを取らずに先に日報を読むと、古い状態（提出済み）で判定してコメントを作ってしまう
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM daily_reports WHERE id = ${SUBMITTED_ID} FOR UPDATE`
        post = postAs('suzuki', SUBMITTED_ID, { target: 'problem', body: '確認しました' })
        await new Promise((resolve) => setTimeout(resolve, 300))
        await tx.dailyReport.update({ where: { id: SUBMITTED_ID }, data: { status: 'DRAFT', submittedAt: null } })
      },
      { timeout: 10_000 },
    )

    expect((await post!).status).toBe(404)
    expect(await countComments(SUBMITTED_ID)).toBe(0)
  })
})

describe('PUT /api/v1/comments/{id}（C-02）', () => {
  setupFixedTime()

  it('T-CMT-12: 投稿した本人が本文を更新すると 200、updated_at が更新される', async () => {
    const response = await putAs('suzuki', SEED_COMMENT.id, { body: '5%までなら即決OK。7%までは私に一報を。' })

    expect(response.status).toBe(200)
    expect(dataResponseSchema(commentSchema).safeParse(response.body).success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: SEED_COMMENT.id,
      body: '5%までなら即決OK。7%までは私に一報を。',
      created_at: '2026-10-29T19:10:00+09:00',
      updated_at: '2026-10-31T10:00:00+09:00',
    })
  })

  it('T-CMT-13: target を送っても変わらない（problem のまま）', async () => {
    const response = await putAs('suzuki', SEED_COMMENT.id, { target: 'plan', body: '修正' })

    expect(response.status).toBe(200)
    expect(response.body.data.target).toBe('problem')
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: SEED_COMMENT.id } })).target).toBe('PROBLEM')
  })

  it.each<[string, SeedStaffKey, number]>([
    ['T-CMT-14: 他チームの上長（日報を閲覧できない）', 'tanaka', 404],
    ['T-CMT-14: 日報を書いた本人（閲覧はできるが投稿者ではない）', 'yamada', 403],
    ['同僚', 'sato', 404],
    ['管理者', 'admin', 404],
  ])('%s が更新すると %i で、本文は変わらない', async (_case, staff, status) => {
    const response = await putAs(staff, SEED_COMMENT.id, { body: '書き換え' })

    expect(response.status).toBe(status)
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: SEED_COMMENT.id } })).body).toBe(SEED_COMMENT.body)
  })

  it.each([9999, 'abc'])('存在しない・数字でないコメントの ID（%s）は 404', async (id) => {
    expect((await putAs('suzuki', id, { body: '修正' })).status).toBe(404)
  })

  it('本文が空白だけなら 400', async () => {
    const response = await putAs('suzuki', SEED_COMMENT.id, { body: '  ' })

    expect(response.status).toBe(400)
    expect(response.body.error?.details).toEqual([{ field: 'body', message: 'コメントは必須です' }])
  })
})

describe('DELETE /api/v1/comments/{id}（C-03）', () => {
  it('T-CMT-15: 投稿した本人が削除すると 204、詳細取得で消えている（物理削除）', async () => {
    const response = await deleteAs('suzuki', SEED_COMMENT.id)

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(await commentsOf('yamada', SEED_REPORTS.commented.id)).toEqual([])
    expect(await prisma.comment.findUnique({ where: { id: SEED_COMMENT.id } })).toBeNull()
  })

  it.each<[string, SeedStaffKey, number]>([
    ['T-CMT-14: 他チームの上長', 'tanaka', 404],
    ['T-CMT-14: 日報を書いた本人', 'yamada', 403],
  ])('%s が削除すると %i で、コメントは残る', async (_case, staff, status) => {
    expect((await deleteAs(staff, SEED_COMMENT.id)).status).toBe(status)
    expect(await prisma.comment.findUnique({ where: { id: SEED_COMMENT.id } })).not.toBeNull()
  })

  it('存在しないコメントは 404', async () => {
    expect((await deleteAs('suzuki', 9999)).status).toBe(404)
  })

  it('T-RPT-69: コメントを全件削除すると、日報を書いた本人がまた更新できる', async () => {
    const { headers } = await loginAs('yamada')
    const update = () =>
      callRoute<Body<{ problem: string; permissions: { can_edit: boolean } }>>(
        putReport,
        `/api/v1/reports/${SEED_REPORTS.commented.id}`,
        {
          method: 'PUT',
          params: { id: String(SEED_REPORTS.commented.id) },
          body: { status: 'submitted', problem: '追記しました', plan: '資料送付', visit_records: [] },
          headers,
        },
      )
    expect((await update()).status).toBe(409)

    expect((await deleteAs('suzuki', SEED_COMMENT.id)).status).toBe(204)
    const response = await update()

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ problem: '追記しました', permissions: { can_edit: true } })
  })
})
