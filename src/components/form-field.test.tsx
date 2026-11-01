import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Controller, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiClientError } from '@/lib/api-client'
import { applyApiErrors } from '@/lib/form-errors'
import { createErrorMap } from '@/lib/validation/error-map'

import { FormField, FormRootError, controlProps } from './form-field'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(20),
})
type Values = z.infer<typeof schema>

/** 共通部品を使ったフォーム。送信すると save を呼び、API のエラーを項目に出す */
function SampleForm({ save }: { save: (values: Values) => Promise<void> }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema, { error: createErrorMap({ name: '顧客名' }) }),
    defaultValues: { name: '', phone: '' },
  })
  async function onSubmit(values: Values) {
    try {
      await save(values)
    } catch (error) {
      applyApiErrors(error, form.setError, { fields: ['name', 'phone'] })
    }
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormRootError errors={form.formState.errors} />
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="name" label="顧客名" required error={fieldState.error}>
            <Input {...field} {...controlProps('name', fieldState.error)} />
          </FormField>
        )}
      />
      <Controller
        name="phone"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="phone" label="電話番号" description="数字とハイフンのみ" error={fieldState.error}>
            <Input {...field} {...controlProps('phone', fieldState.error)} />
          </FormField>
        )}
      />
      <Button type="submit">保存</Button>
    </form>
  )
}

function renderForm(save = vi.fn()) {
  render(<SampleForm save={save} />)
  return userEvent.setup()
}

describe('フォームの項目（FormField）', () => {
  it('必須項目のラベルに * を出し、読み上げでは「必須」と伝える', () => {
    renderForm()

    expect(screen.getByLabelText('顧客名*（必須）')).toBeInTheDocument()
    expect(screen.getByLabelText('電話番号')).toHaveAccessibleDescription('')
    expect(screen.getByText('数字とハイフンのみ')).toBeInTheDocument()
  })

  it('空のまま保存すると、項目のすぐ下にエラーが出て、入力欄がエラーの状態になる（M-02）', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('button', { name: '保存' }))

    const input = screen.getByRole('textbox', { name: /顧客名/ })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('顧客名は必須です')
  })
})

describe('API の 400 エラーをフォームに出す', () => {
  it('details の各項目のメッセージが、該当する項目の下に出る', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'phone', message: '電話番号は数字とハイフンで入力してください' },
      ]),
    )
    const user = renderForm(save)

    await user.type(screen.getByRole('textbox', { name: /顧客名/ }), 'ABC商事')
    await user.type(screen.getByRole('textbox', { name: '電話番号' }), '03(1234)5678')
    await user.click(screen.getByRole('button', { name: '保存' }))

    const phone = screen.getByRole('textbox', { name: '電話番号' })
    expect(await screen.findByText('電話番号は数字とハイフンで入力してください')).toBeInTheDocument()
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveFocus()
    // 入力した内容は消えない
    expect(phone).toHaveValue('03(1234)5678')
  })

  it('項目に結び付けられないエラーは、フォームの先頭にまとめて出す', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
        { field: 'assigned_sales_id', message: '担当営業が見つかりません' },
      ]),
    )
    const user = renderForm(save)

    await user.type(screen.getByRole('textbox', { name: /顧客名/ }), 'ABC商事')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('担当営業が見つかりません')
  })
})
