'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { useConfirm } from '@/components/confirm-dialog'
import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { AppHeader } from '@/components/layout/app-header'
import { useUnsavedChangesGuard } from '@/components/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Role } from '@/generated/prisma/client'
import { ApiClientError } from '@/lib/api-client'
import { applyApiErrors } from '@/lib/form-errors'
import { CONFIRM_MESSAGES } from '@/lib/messages'
import { notifySuccess } from '@/lib/notify'
import { createErrorMap } from '@/lib/validation/error-map'

const customerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(20),
})
type CustomerValues = z.infer<typeof customerSchema>

const ROLES: { role: Role; label: string }[] = [
  { role: 'SALES', label: '営業' },
  { role: 'MANAGER', label: '上長' },
  { role: 'ADMIN', label: '管理者' },
]

/** 共通レイアウト・共通部品（#21）の見本 */
export function CommonPartsSample() {
  const confirm = useConfirm()
  const [role, setRole] = useState<Role>('SALES')
  const [simulateApiError, setSimulateApiError] = useState(true)

  const form = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema, { error: createErrorMap({ name: '顧客名' }) }),
    defaultValues: { name: '', phone: '' },
  })
  useUnsavedChangesGuard(form.formState.isDirty)

  async function onSubmit(values: CustomerValues) {
    try {
      if (simulateApiError) {
        // API が 400 を返した場合の動き（本物の画面では api.post() が投げる）
        throw new ApiClientError(400, 'VALIDATION_ERROR', '入力内容に誤りがあります', undefined, [
          { field: 'phone', message: '電話番号は数字とハイフンで入力してください' },
          { field: '', message: '（項目に結び付けられないエラーは、ここに出ます）' },
        ])
      }
      notifySuccess('saved')
      form.reset(values)
    } catch (error) {
      applyApiErrors(error, form.setError, { fields: ['name', 'phone'] })
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-8">
      <h2 className="text-xl font-bold">共通レイアウト・共通部品</h2>

      <Card>
        <CardHeader>
          <CardTitle>ヘッダー（T-UI-03）</CardTitle>
          <CardDescription>ロールでメニューが変わります。画面の幅を狭めると「≡」に折りたたまれます（ログアウトは本当にログアウトします）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {ROLES.map((item) => (
              <Button key={item.role} size="sm" variant={item.role === role ? 'default' : 'outline'} onClick={() => setRole(item.role)}>
                {item.label}
              </Button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border">
            <AppHeader user={{ name: '山田太郎', role }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>確認ダイアログ・完了メッセージ</CardTitle>
          <CardDescription>useConfirm() と CONFIRM_MESSAGES（M-06〜M-08・M-11・M-12）、notifySuccess()（M-09）</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(CONFIRM_MESSAGES).map(([key, options]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={async () => toast(`${key}：${(await confirm(options)) ? '実行する' : 'やめる'}`)}
            >
              {key}
            </Button>
          ))}
          <Button size="sm" onClick={() => notifySuccess('submitted')}>
            提出しました
          </Button>
          <Button size="sm" onClick={() => notifySuccess('commented')}>
            コメントを投稿しました
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>フォームの共通部品・API エラーの表示・未保存の離脱確認</CardTitle>
          <CardDescription>
            入力してから <Link href="/" className="underline">トップ画面へのリンク</Link> を押すと、確認ダイアログ（M-07）が出ます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form id="common-parts-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormRootError errors={form.formState.errors} />
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField id="sample-name" label="顧客名" required error={fieldState.error}>
                  <Input {...field} {...controlProps('sample-name', fieldState.error)} placeholder="ABC商事" />
                </FormField>
              )}
            />
            <Controller
              name="phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField id="sample-phone" label="電話番号" description="数字とハイフンのみ" error={fieldState.error}>
                  <Input {...field} {...controlProps('sample-phone', fieldState.error)} placeholder="03-1234-5678" />
                </FormField>
              )}
            />
          </form>
          <div className="flex items-center gap-2">
            <Checkbox id="simulate-api-error" checked={simulateApiError} onCheckedChange={(checked) => setSimulateApiError(checked === true)} />
            <Label htmlFor="simulate-api-error">保存すると API が 400 を返したことにする</Label>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="common-parts-form">
            保存
          </Button>
        </CardFooter>
      </Card>
    </section>
  )
}
