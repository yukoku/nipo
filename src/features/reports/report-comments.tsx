'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { EllipsisIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { useConfirm } from '@/components/confirm-dialog'
import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api-client'
import { formatDateTimeForDisplay } from '@/lib/date'
import { apiErrorMessage, applyApiErrors } from '@/lib/form-errors'
import { CONFIRM_MESSAGES } from '@/lib/messages'
import { notifyError, notifySuccess } from '@/lib/notify'
import { createErrorMap } from '@/lib/validation/error-map'
import { COMMENT_LIMITS, type CommentTarget, commentUpdateRequestSchema } from '@/schemas/comment'

/** 日報詳細に表示するコメント（`getReport()` の `comments[]`） */
export interface ReportComment {
  id: number
  target: CommentTarget
  body: string
  commenter: { id: number; name: string }
  createdAt: Date
  updatedAt: Date
}

interface ReportCommentsProps {
  reportId: number
  target: CommentTarget
  /** このセクション（Problem / Plan）のコメント。投稿日時の古い順 */
  comments: readonly ReportComment[]
  /** コメントを投稿できるか（`permissions.canComment`。T-UI-18） */
  canComment: boolean
  /** ログインユーザーの ID（自分のコメントにだけ「…」メニューを出す） */
  currentUserId: number
}

const TARGET_LABELS: Record<CommentTarget, string> = { problem: 'Problem', plan: 'Plan' }

/** コメントの入力欄の値 */
interface CommentFormValues {
  body: string
}

const commentResolver = zodResolver(commentUpdateRequestSchema, { error: createErrorMap() })

/**
 * 日報詳細（SC-04）の Problem・Plan それぞれの下に出すコメント欄
 *
 * - コメントを投稿日時の古い順に表示する（投稿者名・日時・本文。改行はそのまま。T-UI-19）。なければ「コメントはまだありません」
 * - 入力欄と「投稿」は、コメントできるとき（日報を書いた人の直属の上長で、提出済み）だけ出す（T-UI-18）
 * - 自分のコメントは「…」メニューから編集・削除できる。削除は確認ダイアログ（M-08）を出す
 * - 投稿・編集・削除の後はトースト（M-09）を出し、画面のデータを読み込み直す（`router.refresh()`）。
 *   コメントが付くと日報が編集できなくなるなど、日報の表示も変わるため
 */
export function ReportComments({ reportId, target, comments, canComment, currentUserId }: ReportCommentsProps) {
  const label = TARGET_LABELS[target]
  return (
    <div className="flex flex-col gap-3 border-l-2 pl-4">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">コメントはまだありません</p>
      ) : (
        <ul aria-label={`${label} へのコメント`} className="flex flex-col gap-2">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} isOwn={comment.commenter.id === currentUserId} />
          ))}
        </ul>
      )}
      {canComment && <NewCommentForm reportId={reportId} target={target} />}
    </div>
  )
}

/** コメント 1 件。自分のコメントなら「…」メニューから編集・削除できる */
function CommentItem({ comment, isOwn }: { comment: ReportComment; isOwn: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const postedAt = formatDateTimeForDisplay(comment.createdAt)
  const edited = comment.updatedAt.getTime() !== comment.createdAt.getTime()

  async function onDelete() {
    if (!(await confirm(CONFIRM_MESSAGES.deleteComment))) {
      return
    }
    setDeleting(true)
    try {
      await api.delete(`/comments/${comment.id}`)
      notifySuccess('deleted')
      router.refresh()
    } catch (error) {
      notifyError(apiErrorMessage(error))
      setDeleting(false)
    }
  }

  return (
    <li
      aria-label={`${comment.commenter.name}さんのコメント（${postedAt}）`}
      aria-busy={deleting}
      className="rounded-lg border bg-muted/30 p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium">{comment.commenter.name}</span>
          <span className="text-muted-foreground">
            {postedAt}
            {edited && '（編集済み）'}
          </span>
        </p>
        {isOwn && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1 size-8"
                aria-label="コメントの操作"
                disabled={deleting}
              >
                <EllipsisIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>編集</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => void onDelete()}>
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <EditCommentForm comment={comment} onDone={() => setEditing(false)} />
      ) : (
        <p className="mt-1 break-words whitespace-pre-wrap">{comment.body}</p>
      )}
    </li>
  )
}

/** コメントの投稿欄。投稿したら入力欄を空にする */
function NewCommentForm({ reportId, target }: { reportId: number; target: CommentTarget }) {
  const router = useRouter()
  const form = useForm<CommentFormValues>({ resolver: commentResolver, defaultValues: { body: '' } })
  const id = `comment-${target}`
  const label = `${TARGET_LABELS[target]} へのコメント`

  async function onSubmit(values: CommentFormValues) {
    try {
      await api.post(`/reports/${reportId}/comments`, { target, body: values.body })
    } catch (error) {
      if (!applyApiErrors(error, form.setError, { fields: ['body'] })) {
        notifyError(apiErrorMessage(error))
      }
      return
    }
    form.reset()
    notifySuccess('commented')
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label={label} className="flex flex-col gap-2">
      <FormRootError errors={form.formState.errors} />
      <CommentBodyField id={id} label={label} control={form.control} />
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '投稿しています…' : '投稿'}
        </Button>
      </div>
    </form>
  )
}

/** 自分のコメントの編集欄 */
function EditCommentForm({ comment, onDone }: { comment: ReportComment; onDone: () => void }) {
  const router = useRouter()
  const form = useForm<CommentFormValues>({ resolver: commentResolver, defaultValues: { body: comment.body } })

  async function onSubmit(values: CommentFormValues) {
    try {
      await api.put(`/comments/${comment.id}`, { body: values.body })
    } catch (error) {
      if (!applyApiErrors(error, form.setError, { fields: ['body'] })) {
        notifyError(apiErrorMessage(error))
      }
      return
    }
    notifySuccess('saved')
    onDone()
    router.refresh()
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      aria-label="コメントの編集"
      className="mt-2 flex flex-col gap-2"
    >
      <FormRootError errors={form.formState.errors} />
      <CommentBodyField id={`comment-${comment.id}-body`} label="コメント" control={form.control} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={form.formState.isSubmitting}>
          キャンセル
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '保存しています…' : '保存'}
        </Button>
      </div>
    </form>
  )
}

/** コメント本文の入力欄（1,000 文字以内。必須） */
function CommentBodyField({
  id,
  label,
  control,
}: {
  id: string
  label: string
  control: ReturnType<typeof useForm<CommentFormValues>>['control']
}) {
  return (
    <Controller
      name="body"
      control={control}
      render={({ field, fieldState }) => (
        <FormField id={id} label={label} required error={fieldState.error}>
          <Textarea
            {...field}
            {...controlProps(id, fieldState.error)}
            rows={2}
            maxLength={COMMENT_LIMITS.body}
            placeholder="コメントを入力…"
          />
        </FormField>
      )}
    />
  )
}
