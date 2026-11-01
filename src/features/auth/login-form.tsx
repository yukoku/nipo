'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'

import { FormField, FormRootError, controlProps } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiClientError, api, setCsrfToken } from '@/lib/api-client'
import { ROOT_ERROR_KEY, apiErrorMessage, applyApiErrors } from '@/lib/form-errors'
import { LOGIN_MESSAGES } from '@/lib/messages'
import { fromApiRole } from '@/lib/roles'
import { homePathForRole, safeRedirectPath } from '@/lib/routes'
import { createErrorMap } from '@/lib/validation/error-map'
import { type LoginFormValues, loginFormSchema } from '@/schemas/auth'
import type { ApiRole } from '@/schemas/auth'

interface LoginResponse {
  data: { role: ApiRole; csrf_token: string }
}

/**
 * ログインフォーム（SC-01）
 *
 * - 成功したら、戻り先（`?next=`）か、ロールごとのトップ画面（営業・上長は日報一覧、管理者は顧客一覧）へ移る（T-UI-01）
 * - 失敗したら M-01、試行回数の上限なら M-13 をフォームの上に出す
 * - 送信中と、成功して移動するまでの間はボタンを押せない（二重送信の防止）
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema, { error: createErrorMap() }),
    defaultValues: { email: '', password: '' },
  })
  const { isSubmitting, isSubmitSuccessful } = form.formState

  async function onSubmit(values: LoginFormValues) {
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', values)
      setCsrfToken(data.csrf_token)
      // next はだれでも書き換えられるので、このサイトの中のパスだけを使う（決定事項 #28）
      router.replace(safeRedirectPath(next) ?? homePathForRole(fromApiRole(data.role)))
    } catch (error) {
      showError(error)
      // 送信に成功した扱いにしない（ボタンを押せるように戻す）
      throw error
    }
  }

  function showError(error: unknown) {
    if (error instanceof ApiClientError && (error.code === 'UNAUTHENTICATED' || error.code === 'TOO_MANY_ATTEMPTS')) {
      const message = error.code === 'UNAUTHENTICATED' ? LOGIN_MESSAGES.failed : LOGIN_MESSAGES.locked
      form.setError(ROOT_ERROR_KEY as 'root.server', { type: 'server', message })
      // パスワードだけ消して、入れ直しやすくする
      form.resetField('password')
      form.setFocus('password')
      return
    }
    if (!applyApiErrors(error, form.setError, { fields: ['email', 'password'] })) {
      form.setError(ROOT_ERROR_KEY as 'root.server', { type: 'server', message: apiErrorMessage(error) })
    }
  }

  return (
    <form
      onSubmit={(event) => {
        // 失敗時に onSubmit が投げ直す例外は、ここで止める（エラーは画面に出し済み）
        form.handleSubmit(onSubmit)(event).catch(() => undefined)
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      <FormRootError errors={form.formState.errors} />
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="email" label="メールアドレス" required error={fieldState.error}>
            <Input
              {...field}
              {...controlProps('email', fieldState.error)}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
            />
          </FormField>
        )}
      />
      <Controller
        name="password"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField id="password" label="パスワード" required error={fieldState.error}>
            <Input {...field} {...controlProps('password', fieldState.error)} type="password" autoComplete="current-password" />
          </FormField>
        )}
      />
      <Button type="submit" size="lg" disabled={isSubmitting || isSubmitSuccessful}>
        {isSubmitting || isSubmitSuccessful ? 'ログインしています…' : 'ログイン'}
      </Button>
    </form>
  )
}
