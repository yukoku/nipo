import type { ReactNode } from 'react'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { ROOT_ERROR_KEY } from '@/lib/form-errors'
import { cn } from '@/lib/utils'

/**
 * フォームの項目の共通部品（docs/screens.md §3.2）
 * - 必須項目はラベルの横に `*` を出す（読み上げでは「必須」）
 * - 入力エラーは項目のすぐ下に赤字で出す
 *
 * @example
 * <Controller name="name" control={form.control} render={({ field, fieldState }) => (
 *   <FormField id="name" label="顧客名" required error={fieldState.error}>
 *     <Input {...field} {...controlProps('name', fieldState.error)} />
 *   </FormField>
 * )} />
 */

interface FieldErrorLike {
  message?: string
}

interface FormFieldProps {
  /** 入力欄の id（ラベルと入力欄を結び付ける） */
  id: string
  label: string
  required?: boolean
  error?: FieldErrorLike
  /** 入力欄の下に出す補足 */
  description?: string
  className?: string
  children: ReactNode
}

export function FormField({ id, label, required = false, error, description, className, children }: FormFieldProps) {
  const invalid = error?.message !== undefined
  return (
    <Field data-invalid={invalid} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <RequiredMark />}
      </FieldLabel>
      {children}
      {description !== undefined && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {invalid && <FieldError id={errorId(id)} errors={[error]} />}
    </Field>
  )
}

/** 必須項目の印。見た目は `*`、読み上げでは「必須」 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="text-destructive">
        *
      </span>
      <span className="sr-only">（必須）</span>
    </>
  )
}

/** 入力欄に付ける属性。エラーのとき `aria-invalid` と、エラーメッセージへの `aria-describedby` を付ける */
export function controlProps(id: string, error?: FieldErrorLike) {
  const invalid = error?.message !== undefined
  return { id, 'aria-invalid': invalid, 'aria-describedby': invalid ? errorId(id) : undefined }
}

function errorId(id: string): string {
  return `${id}-error`
}

/**
 * フォーム全体のエラー（API のエラーで、項目に結び付けられないもの。`applyApiErrors()` が設定する）。
 * フォームの先頭か、送信ボタンの近くに置く
 *
 * @example
 * <FormRootError errors={form.formState.errors} />
 */
export function FormRootError({ errors, className }: { errors: { root?: Record<string, FieldErrorLike | undefined> }; className?: string }) {
  const message = errors.root?.[ROOT_ERROR_KEY.replace('root.', '')]?.message
  if (message === undefined || message === '') {
    return null
  }
  return (
    <div role="alert" className={cn('rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm whitespace-pre-line text-destructive', className)}>
      {message}
    </div>
  )
}
