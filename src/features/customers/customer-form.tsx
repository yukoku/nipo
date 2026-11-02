'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import type { z } from 'zod'

import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { useUnsavedChangesGuard } from '@/components/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api-client'
import { apiErrorMessage, applyApiErrors } from '@/lib/form-errors'
import { notifyError, notifySuccess } from '@/lib/notify'
import { createErrorMap } from '@/lib/validation/error-map'
import { CUSTOMER_FIELD_LABELS, CUSTOMER_LIMITS, customerUpdateRequestSchema } from '@/schemas/customer'

/** 顧客一覧（SC-05）。保存・キャンセルの後に戻る */
const LIST_PATH = '/customers'

/** 担当営業の「未設定」を表す値。Select は空文字の値を使えないため */
const UNASSIGNED = 'none'

/** フォームの項目（API と同じ snake_case のキー。M-04 のスキーマを登録・編集の両方で使う） */
type FormInput = z.input<typeof customerUpdateRequestSchema>
type FormOutput = z.output<typeof customerUpdateRequestSchema>

const FORM_FIELDS = ['name', 'contact_person', 'phone', 'address', 'assigned_sales_id', 'is_active'] as const

/** 編集する顧客（編集時だけ渡す） */
export interface CustomerFormCustomer {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  address: string | null
  assignedSales: { id: number; name: string } | null
  isActive: boolean
}

interface CustomerFormProps {
  /** 編集する顧客。省略すると新規登録 */
  customer?: CustomerFormCustomer
  /** 担当営業の選択肢（有効な営業・上長） */
  staffOptions: { id: number; name: string }[]
}

/**
 * 顧客登録・編集のフォーム（SC-06）
 *
 * - 新規と編集で同じフォームを使う。入力チェックは API と同じ Zod スキーマ（`customerUpdateRequestSchema`）
 * - 状態（有効・無効）は編集時だけ表示する。新規は有効で登録される（M-02）
 * - 保存したら M-09 を出して顧客一覧へ戻る。未保存のまま離れるときは M-07 で確かめる
 */
export function CustomerForm({ customer, staffOptions }: CustomerFormProps) {
  const router = useRouter()
  const isEdit = customer !== undefined
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(customerUpdateRequestSchema, { error: createErrorMap(CUSTOMER_FIELD_LABELS) }),
    defaultValues: {
      name: customer?.name ?? '',
      contact_person: customer?.contactPerson ?? '',
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
      assigned_sales_id: customer?.assignedSales?.id ?? null,
      is_active: customer?.isActive ?? true,
    },
  })
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState
  // 保存に成功した後は、一覧へ移るまでの間に確認を出さない
  const { confirmLeave } = useUnsavedChangesGuard(isDirty && !isSubmitSuccessful)

  const assignableStaff = withCurrentAssignedSales(staffOptions, customer?.assignedSales ?? null)

  async function onSubmit(values: FormOutput) {
    try {
      if (isEdit) {
        await api.put(`/customers/${customer.id}`, values)
      } else {
        // 新規は有効で登録される（is_active は送らない）
        const { is_active: _ignored, ...body } = values
        await api.post('/customers', body)
      }
    } catch (error) {
      if (!applyApiErrors(error, form.setError, { fields: FORM_FIELDS })) {
        notifyError(apiErrorMessage(error))
      }
      // 送信に成功した扱いにしない（未保存の確認を続け、ボタンを押せるように戻す）
      throw error
    }
    notifySuccess('saved')
    router.push(LIST_PATH)
  }

  async function onCancel() {
    if (await confirmLeave()) {
      router.push(LIST_PATH)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        // 失敗時に onSubmit が投げ直す例外は、ここで止める（エラーは画面に出し済み）
        form.handleSubmit(onSubmit)(event).catch(() => undefined)
      }}
      noValidate
      aria-label={isEdit ? '顧客編集' : '顧客登録'}
      className="flex max-w-xl flex-col gap-5"
    >
      <FormRootError errors={form.formState.errors} />

      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="name" label="顧客名" required error={fieldState.error}>
            <Input {...field} {...controlProps('name', fieldState.error)} maxLength={CUSTOMER_LIMITS.name} autoFocus />
          </FormField>
        )}
      />
      <Controller
        name="contact_person"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="contact_person" label="先方担当者" error={fieldState.error}>
            <Input
              {...field}
              value={field.value ?? ''}
              {...controlProps('contact_person', fieldState.error)}
              maxLength={CUSTOMER_LIMITS.contactPerson}
            />
          </FormField>
        )}
      />
      <Controller
        name="phone"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="phone" label="電話番号" description="市外局番から入力（例：03-1234-5678・090-1234-5678。ハイフンなしも可）" error={fieldState.error}>
            <Input
              {...field}
              value={field.value ?? ''}
              {...controlProps('phone', fieldState.error)}
              type="tel"
              inputMode="tel"
              maxLength={CUSTOMER_LIMITS.phone}
            />
          </FormField>
        )}
      />
      <Controller
        name="address"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="address" label="住所" error={fieldState.error}>
            <Input
              {...field}
              value={field.value ?? ''}
              {...controlProps('address', fieldState.error)}
              maxLength={CUSTOMER_LIMITS.address}
            />
          </FormField>
        )}
      />
      <Controller
        name="assigned_sales_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="assigned_sales_id" label="担当営業" error={fieldState.error}>
            <Select
              value={field.value == null ? UNASSIGNED : String(field.value)}
              onValueChange={(value) => field.onChange(value === UNASSIGNED ? null : Number(value))}
            >
              <SelectTrigger
                {...controlProps('assigned_sales_id', fieldState.error)}
                ref={field.ref}
                onBlur={field.onBlur}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>未設定</SelectItem>
                {assignableStaff.map((staff) => (
                  <SelectItem key={staff.id} value={String(staff.id)}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      />
      {isEdit && (
        <Controller
          name="is_active"
          control={form.control}
          render={({ field, fieldState }) => (
            <FormField id="is_active" label="状態" required error={fieldState.error}>
              <RadioGroup
                {...controlProps('is_active', fieldState.error)}
                ref={field.ref}
                value={field.value ? 'active' : 'inactive'}
                onValueChange={(value) => field.onChange(value === 'active')}
                aria-label="状態"
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="is_active-active" value="active" />
                  <Label htmlFor="is_active-active">有効</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="is_active-inactive" value="inactive" />
                  <Label htmlFor="is_active-inactive">無効</Label>
                </div>
              </RadioGroup>
            </FormField>
          )}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => void onCancel()} disabled={isSubmitting || isSubmitSuccessful}>
          キャンセル
        </Button>
        <Button type="submit" disabled={isSubmitting || isSubmitSuccessful}>
          {isSubmitting || isSubmitSuccessful ? '保存しています…' : '保存'}
        </Button>
      </div>
    </form>
  )
}

/**
 * 担当営業の選択肢。今の担当営業が無効になっていて選択肢にないときは、「（無効）」を付けて足す。
 * 担当を付け替えずに他の項目を直せるようにするため（決定事項 #30）
 */
function withCurrentAssignedSales(
  options: { id: number; name: string }[],
  current: { id: number; name: string } | null,
): { id: number; name: string }[] {
  if (current === null || options.some((option) => option.id === current.id)) {
    return options
  }
  return [...options, { id: current.id, name: `${current.name}（無効）` }]
}
