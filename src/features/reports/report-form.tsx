'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form'

import { useConfirm } from '@/components/confirm-dialog'
import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { useUnsavedChangesGuard } from '@/components/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError, api } from '@/lib/api-client'
import { apiErrorMessage, applyApiErrors } from '@/lib/form-errors'
import { CONFIRM_MESSAGES } from '@/lib/messages'
import { notifyError, notifySuccess } from '@/lib/notify'
import { REPORT_LIST_PATH, reportDetailPath } from '@/lib/routes'
import { createErrorMap } from '@/lib/validation/error-map'
import {
  REPORT_LIMITS,
  type ReportCreateRequest,
  type ReportStatus,
  reportCreateRequestSchema,
  reportUpdateRequestSchema,
} from '@/schemas/report'

/** 訪問記録の 1 行（フォームの値。API と同じ snake_case） */
export interface VisitRecordFormValue {
  id?: number
  customer_id: number
  visited_at: string | null
  content: string
}

/** フォームの項目（API と同じ snake_case のキー） */
interface FormValues {
  report_date: string
  status: ReportStatus
  problem: string
  plan: string
  visit_records: VisitRecordFormValue[]
}

const FORM_FIELDS = ['report_date', 'status', 'problem', 'plan', 'visit_records'] as const

/** 編集する日報（編集時だけ渡す） */
export interface ReportFormReport {
  id: number
  reportDate: string
  status: ReportStatus
  problem: string | null
  plan: string | null
  visitRecords: (VisitRecordFormValue & { customerName: string })[]
}

interface ReportFormProps {
  /** 編集する日報。省略すると新規作成 */
  report?: ReportFormReport
  /** 新規作成のときの報告日の初期値（JST の今日） */
  today: string
}

/**
 * 日報作成・編集のフォーム本体（SC-03）
 *
 * - 新規と編集で同じフォームを使う。入力チェックは API と同じ Zod スキーマ（新規は R-02、編集は R-04）
 * - 報告日は編集のときは変えられない（T-UI-16）
 * - 「下書き保存」は報告日だけが必須、「提出する」は Problem・Plan も必須。提出は確認ダイアログ（M-06）の後に送る（T-UI-14）
 * - 提出済みの日報の編集では、ボタンは「更新する」だけ（下書きには戻せない）
 * - 同じ日付の日報がある（409）ときは M-04 を報告日の下に出す
 * - 保存したら日報詳細（SC-04）へ移り、M-09 を出す。未保存のまま離れるときは M-07 で確かめる（T-UI-15）
 * - 訪問記録の入力欄は #36 で作る。それまでは、編集する日報の訪問記録をそのまま送り返す（全件置き換えのため、送らないと消える）
 */
export function ReportForm({ report, today }: ReportFormProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const isEdit = report !== undefined
  const isSubmitted = report?.status === 'submitted'
  const schema = isEdit ? reportUpdateRequestSchema : reportCreateRequestSchema
  const form = useForm<FormValues, unknown, ReportCreateRequest>({
    // 新規と編集でスキーマが違う（編集は report_date を受け取らない）ため、フォームの型に合わせる
    resolver: zodResolver(schema, {
      error: createErrorMap(),
    }) as unknown as Resolver<FormValues, unknown, ReportCreateRequest>,
    defaultValues: {
      report_date: report?.reportDate ?? today,
      status: report?.status ?? 'draft',
      problem: report?.problem ?? '',
      plan: report?.plan ?? '',
      visit_records: report?.visitRecords.map(({ customerName: _name, ...record }) => record) ?? [],
    },
  })
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState
  const { confirmLeave } = useUnsavedChangesGuard(isDirty && !isSubmitSuccessful)
  const busy = isSubmitting || isSubmitSuccessful

  /** 押したボタンのステータスで、入力チェックと保存をする */
  function submitAs(status: ReportStatus) {
    form.setValue('status', status)
    // 失敗・取りやめで onSubmit が投げる例外は、ここで止める（エラーは画面に出し済み）
    form
      .handleSubmit(onSubmit)()
      .catch(() => undefined)
  }

  async function onSubmit(values: ReportCreateRequest) {
    // 初めて提出するときだけ確かめる（提出済みの「更新する」は確かめない）
    if (values.status === 'submitted' && !isSubmitted && !(await confirm(CONFIRM_MESSAGES.submitReport))) {
      throw new Error('cancelled')
    }
    let id: number
    try {
      if (isEdit) {
        const { report_date: _date, ...body } = values
        await api.put(`/reports/${report.id}`, body)
        id = report.id
      } else {
        ;({
          data: { id },
        } = await api.post<{ data: { id: number } }>('/reports', values))
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.reason === 'REPORT_ALREADY_EXISTS') {
        // M-04 は報告日の下に出す
        form.setError('report_date', { type: 'server', message: error.message }, { shouldFocus: true })
      } else if (!applyApiErrors(error, form.setError, { fields: FORM_FIELDS })) {
        notifyError(apiErrorMessage(error))
      }
      throw error
    }
    notifySuccess(values.status === 'submitted' && !isSubmitted ? 'submitted' : 'saved')
    router.push(reportDetailPath(id))
  }

  async function onCancel() {
    if (await confirmLeave()) {
      router.push(isEdit ? reportDetailPath(report.id) : REPORT_LIST_PATH)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        // Enter キーで送信したときは、下書き保存（提出済みなら更新）として扱う
        submitAs(isSubmitted ? 'submitted' : 'draft')
      }}
      noValidate
      aria-label={isEdit ? '日報編集' : '日報作成'}
      className="flex max-w-3xl flex-col gap-6"
    >
      <FormRootError errors={form.formState.errors} />

      <Controller
        name="report_date"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField
            id="report_date"
            label="報告日"
            required
            description={isEdit ? '報告日は変更できません' : undefined}
            error={fieldState.error}
            className="md:max-w-56"
          >
            <Input
              {...field}
              {...controlProps('report_date', fieldState.error)}
              type="date"
              max={today}
              disabled={isEdit}
            />
          </FormField>
        )}
      />

      <section aria-labelledby="visit-records-heading" className="flex flex-col gap-2">
        <h2 id="visit-records-heading" className="text-lg font-semibold">
          訪問記録
        </h2>
        <VisitRecordsPreview records={report?.visitRecords ?? []} />
      </section>

      <ReportTextField name="problem" label="Problem（課題・相談）" control={form.control} />
      <ReportTextField name="plan" label="Plan（明日やること）" control={form.control} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => void onCancel()} disabled={busy}>
          キャンセル
        </Button>
        {isSubmitted ? (
          <Button type="button" onClick={() => submitAs('submitted')} disabled={busy}>
            {busy ? '保存しています…' : '更新する'}
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => submitAs('draft')} disabled={busy}>
              下書き保存
            </Button>
            <Button type="button" onClick={() => submitAs('submitted')} disabled={busy}>
              提出する
            </Button>
          </>
        )}
      </div>
      {busy && (
        <p role="status" className="sr-only">
          保存しています…
        </p>
      )}
    </form>
  )
}

/** Problem・Plan の入力欄。提出時は必須（説明文で知らせる）。残りの文字数を出す */
function ReportTextField({
  name,
  label,
  control,
}: {
  name: 'problem' | 'plan'
  label: string
  control: ReturnType<typeof useForm<FormValues, unknown, ReportCreateRequest>>['control']
}) {
  const value = useWatch({ control, name }) ?? ''
  const remaining = REPORT_LIMITS.text - value.length
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormField
          id={name}
          label={label}
          description={`提出するときは必須です。残り ${remaining} 文字`}
          error={fieldState.error}
        >
          <Textarea {...field} {...controlProps(name, fieldState.error)} rows={4} maxLength={REPORT_LIMITS.text} />
        </FormField>
      )}
    />
  )
}

/** 訪問記録の表示（読み取り専用。入力欄は #36 で作る） */
function VisitRecordsPreview({ records }: { records: ReportFormReport['visitRecords'] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">訪問記録はありません</p>
  }
  return (
    <ol aria-label="訪問記録" className="flex flex-col gap-2">
      {records.map((record, index) => (
        <li key={record.id ?? index} className="rounded-lg border p-3 text-sm">
          <div className="flex gap-3 font-medium">
            <span>{record.visited_at ?? '--:--'}</span>
            <span>{record.customerName}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{record.content}</p>
        </li>
      ))}
    </ol>
  )
}
