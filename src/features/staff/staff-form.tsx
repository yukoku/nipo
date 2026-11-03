'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useConfirm } from '@/components/confirm-dialog'
import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { useUnsavedChangesGuard } from '@/components/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiClientError, api } from '@/lib/api-client'
import { apiErrorMessage, applyApiErrors } from '@/lib/form-errors'
import { CONFIRM_MESSAGES } from '@/lib/messages'
import { notifyError, notifySuccess } from '@/lib/notify'
import { ROLE_LABELS } from '@/lib/roles'
import { createErrorMap } from '@/lib/validation/error-map'
import type { ApiRole } from '@/schemas/auth'
import {
  STAFF_FIELD_LABELS,
  STAFF_LIMITS,
  type StaffUpdateRequest,
  staffCreateRequestSchema,
  staffUpdateRequestSchema,
} from '@/schemas/sales-staff'

/** 営業一覧（SC-07）。保存・キャンセルの後に戻る */
const LIST_PATH = '/staff'

/** 上長の「未設定」を表す値。Select は空文字の値を使えないため */
const NO_MANAGER = 'none'

const ROLES: readonly ApiRole[] = ['sales', 'manager', 'admin']

/**
 * 新規のときの入力チェック。S-02 のスキーマ（パスワード必須）に、画面にだけある `is_active` を足したもの。
 * 「上長に上長を設定できない」チェック（refinement）を残すため `safeExtend()` を使う
 */
const createFormSchema = staffCreateRequestSchema.safeExtend({ is_active: z.boolean() })

/** フォームの項目（API と同じ snake_case のキー） */
interface FormValues {
  name: string
  email: string
  password: string
  department: string | null
  role: ApiRole
  manager_id: number | null
  is_active: boolean
}

const FORM_FIELDS = ['name', 'email', 'password', 'department', 'role', 'manager_id', 'is_active'] as const

/** 編集する営業（編集時だけ渡す） */
export interface StaffFormStaff {
  id: number
  name: string
  email: string
  department: string | null
  role: ApiRole
  manager: { id: number; name: string } | null
  isActive: boolean
  /** 有効な直属の部下の人数（M-11 の警告に使う。決定事項 #17） */
  subordinateCount: number
}

interface StaffFormProps {
  /** 編集する営業。省略すると新規登録 */
  staff?: StaffFormStaff
  /** 上長の選択肢（有効な上長。編集時は本人と配下を除いたもの） */
  managerOptions: { id: number; name: string }[]
  /** 編集しているのがログイン中の管理者自身か（自分の権限・状態は変えられない。docs/api.md S-04） */
  isSelf?: boolean
}

/**
 * 営業登録・編集のフォーム（SC-08）
 *
 * - 新規と編集で同じフォームを使う。入力チェックは API と同じ Zod スキーマ（新規は S-02、編集は S-04）
 * - パスワードは新規のときは必須。編集のときは空欄なら送らない（変更しない）
 * - 状態（有効・無効）は編集時だけ表示する。新規は有効で登録される
 * - 権限が「上長」の人には上長を設定できない。「上長」を選んだら上長を未設定に戻し、選べなくする（決定事項 #35）
 * - 部下がいる上長を無効にして保存するときは、M-11 で確かめる（T-UI-24）
 * - メールアドレスの重複（409）は、M-10 をメールアドレス欄の下に出す
 * - 保存したら M-09 を出して営業一覧へ戻る。未保存のまま離れるときは M-07 で確かめる
 */
export function StaffForm({ staff, managerOptions, isSelf = false }: StaffFormProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const isEdit = staff !== undefined
  const schema = isEdit ? staffUpdateRequestSchema : createFormSchema
  const form = useForm<FormValues, unknown, StaffUpdateRequest>({
    // 新規と編集でスキーマが違う（パスワードの必須）ため、フォームの型に合わせる
    resolver: zodResolver(schema, { error: createErrorMap(STAFF_FIELD_LABELS) }) as unknown as Resolver<
      FormValues,
      unknown,
      StaffUpdateRequest
    >,
    defaultValues: {
      name: staff?.name ?? '',
      email: staff?.email ?? '',
      password: '',
      department: staff?.department ?? '',
      role: staff?.role ?? 'sales',
      // 権限が「上長」の人には上長を設定できない（決定事項 #35）。既存のデータに上長があっても、保存すると外れる
      manager_id: staff?.role === 'manager' ? null : (staff?.manager?.id ?? null),
      is_active: staff?.isActive ?? true,
    },
  })
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState
  // 保存に成功した後は、一覧へ移るまでの間に確認を出さない
  const { confirmLeave } = useUnsavedChangesGuard(isDirty && !isSubmitSuccessful)

  const selectableManagers = withCurrentManager(managerOptions, staff?.manager ?? null)
  const isManagerRole = useWatch({ control: form.control, name: 'role' }) === 'manager'

  async function onSubmit(values: StaffUpdateRequest) {
    if (isEdit && needsDeactivateWarning(staff, values.is_active) && !(await confirm(CONFIRM_MESSAGES.deactivateManager))) {
      // 「やめる」を選んだら保存しない。送信に成功した扱いにしない
      throw new Error('cancelled')
    }
    try {
      if (isEdit) {
        // パスワードが空欄なら送らない（変更しない）
        const { password, ...rest } = values
        await api.put(`/sales-staff/${staff.id}`, password === undefined ? rest : values)
      } else {
        // 新規は有効で登録される（is_active は送らない）
        const { is_active: _ignored, ...body } = values
        await api.post('/sales-staff', body)
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.reason === 'EMAIL_ALREADY_EXISTS') {
        // M-10 はメールアドレス欄の下に出す
        form.setError('email', { type: 'server', message: error.message }, { shouldFocus: true })
      } else if (!applyApiErrors(error, form.setError, { fields: FORM_FIELDS })) {
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
        // 失敗・取りやめで onSubmit が投げる例外は、ここで止める（エラーは画面に出し済み）
        form.handleSubmit(onSubmit)(event).catch(() => undefined)
      }}
      noValidate
      aria-label={isEdit ? '営業編集' : '営業登録'}
      className="flex max-w-xl flex-col gap-5"
    >
      <FormRootError errors={form.formState.errors} />

      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="name" label="氏名" required error={fieldState.error}>
            <Input {...field} {...controlProps('name', fieldState.error)} maxLength={STAFF_LIMITS.name} autoFocus />
          </FormField>
        )}
      />
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="email" label="メールアドレス" required error={fieldState.error}>
            <Input
              {...field}
              {...controlProps('email', fieldState.error)}
              type="email"
              autoComplete="off"
              maxLength={STAFF_LIMITS.email}
            />
          </FormField>
        )}
      />
      <Controller
        name="password"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField
            id="password"
            label="パスワード"
            required={!isEdit}
            description={
              isEdit
                ? '変更する場合のみ入力してください（8〜64 文字、英字と数字を各 1 文字以上）'
                : '8〜64 文字、英字と数字を各 1 文字以上含めてください'
            }
            error={fieldState.error}
          >
            <Input {...field} {...controlProps('password', fieldState.error)} type="password" autoComplete="new-password" />
          </FormField>
        )}
      />
      <Controller
        name="department"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="department" label="部署" error={fieldState.error}>
            <Input
              {...field}
              value={field.value ?? ''}
              {...controlProps('department', fieldState.error)}
              maxLength={STAFF_LIMITS.department}
            />
          </FormField>
        )}
      />
      <Controller
        name="role"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField
            id="role"
            label="権限"
            required
            description={isSelf ? '自分自身の権限は変更できません' : undefined}
            error={fieldState.error}
          >
            <RadioGroup
              {...controlProps('role', fieldState.error)}
              ref={field.ref}
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                if (value === 'manager') {
                  // 権限が「上長」の人には上長を設定できない（決定事項 #35）
                  form.setValue('manager_id', null, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })
                }
              }}
              disabled={isSelf}
              aria-label="権限"
              className="flex gap-6"
            >
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <RadioGroupItem id={`role-${role}`} value={role} />
                  <Label htmlFor={`role-${role}`}>{ROLE_LABELS[role]}</Label>
                </div>
              ))}
            </RadioGroup>
          </FormField>
        )}
      />
      <Controller
        name="manager_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField
            id="manager_id"
            label="上長"
            description={isManagerRole ? '権限が「上長」の担当者には、上長を設定できません' : undefined}
            error={fieldState.error}
          >
            <Select
              value={field.value == null ? NO_MANAGER : String(field.value)}
              onValueChange={(value) => field.onChange(value === NO_MANAGER ? null : Number(value))}
              disabled={isManagerRole}
            >
              <SelectTrigger
                {...controlProps('manager_id', fieldState.error)}
                ref={field.ref}
                onBlur={field.onBlur}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGER}>未設定</SelectItem>
                {selectableManagers.map((manager) => (
                  <SelectItem key={manager.id} value={String(manager.id)}>
                    {manager.name}
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
            <FormField
              id="is_active"
              label="状態"
              required
              description={isSelf ? '自分自身を無効にすることはできません' : '無効にするとログインできなくなります'}
              error={fieldState.error}
            >
              <RadioGroup
                {...controlProps('is_active', fieldState.error)}
                ref={field.ref}
                value={field.value ? 'active' : 'inactive'}
                onValueChange={(value) => field.onChange(value === 'active')}
                disabled={isSelf}
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

/** 有効な部下がいる上長を、有効から無効に変えるときは警告（M-11）を出す */
function needsDeactivateWarning(staff: StaffFormStaff, isActive: boolean): boolean {
  return staff.isActive && !isActive && staff.subordinateCount > 0
}

/**
 * 上長の選択肢。今の上長が無効になっていて選択肢にないときは、「（無効）」を付けて足す。
 * 上長を付け替えずに他の項目を直せるようにするため（docs/api.md S-04。決定事項 #30 と同じ考え方）
 */
function withCurrentManager(
  options: { id: number; name: string }[],
  current: { id: number; name: string } | null,
): { id: number; name: string }[] {
  if (current === null || options.some((option) => option.id === current.id)) {
    return options
  }
  return [...options, { id: current.id, name: `${current.name}（無効）` }]
}
