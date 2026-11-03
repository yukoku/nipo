'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { type Control, Controller, type Resolver, useFieldArray, useForm, useWatch } from 'react-hook-form'

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

import type { CustomerOption } from './customer-combobox'
import {
  type VisitRecordFormValue,
  type VisitRecordsFormValues,
  VisitRecordsField,
  isEmptyVisitRecord,
} from './visit-records-field'

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
  visitRecords: { id: number; customerId: number; customerName: string; visitedAt: string | null; content: string }[]
}

/** 無効になった顧客の表示名に付ける印 */
const INACTIVE_SUFFIX = '（無効）'

interface ReportFormProps {
  /** 編集する日報。省略すると新規作成 */
  report?: ReportFormReport
  /** 新規作成のときの報告日の初期値（JST の今日） */
  today: string
  /** 訪問記録の顧客セレクトの選択肢（有効な顧客だけ） */
  customerOptions: readonly CustomerOption[]
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
 * - 訪問記録は行の追加・削除・並べ替えができる。何も入力していない行は、送信する前に取り除く（docs/api.md R-02）
 * - 編集では既存の行を `id` 付きで送る（R-04 は全件置き換え）。無効になった顧客の行は「（無効）」を付けて表示し、そのまま保存できる（決定事項 #36）
 */
export function ReportForm({ report, today, customerOptions }: ReportFormProps) {
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
      visit_records:
        report?.visitRecords.map((record) => ({
          id: record.id,
          customer_id: record.customerId,
          visited_at: record.visitedAt ?? '',
          content: record.content,
        })) ?? [],
    },
  })
  // 訪問記録の部分は、訪問記録の入力欄の型で扱う
  const visitControl = form.control as unknown as Control<VisitRecordsFormValues>
  const visitRecords = useFieldArray({ control: visitControl, name: 'visit_records', keyName: 'key' })
  const customerLabels = useMemo(() => {
    const labels = new Map(customerOptions.map((option) => [option.id, option.name]))
    // 編集する日報の顧客で、選択肢にない（無効になった）顧客
    for (const record of report?.visitRecords ?? []) {
      if (!labels.has(record.customerId)) {
        labels.set(record.customerId, `${record.customerName}${INACTIVE_SUFFIX}`)
      }
    }
    return labels
  }, [customerOptions, report])
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState
  const { confirmLeave } = useUnsavedChangesGuard(isDirty && !isSubmitSuccessful)
  const busy = isSubmitting || isSubmitSuccessful

  /** 押したボタンのステータスで、入力チェックと保存をする */
  function submitAs(status: ReportStatus) {
    form.setValue('status', status)
    // 何も入力していない行は取り除く（入力チェックのエラーの行番号と、画面の行がずれないよう、先に取り除く）
    const emptyRows = form
      .getValues('visit_records')
      .flatMap((record, index) => (isEmptyVisitRecord(record) ? [index] : []))
    if (emptyRows.length > 0) {
      visitRecords.remove(emptyRows)
    }
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
        <VisitRecordsField
          control={visitControl}
          fieldArray={visitRecords}
          errors={form.formState.errors.visit_records}
          customerOptions={customerOptions}
          customerLabels={customerLabels}
        />
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
