'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const sampleSchema = z.object({
  customerName: z.string().trim().min(1, '顧客名は必須です').max(100, '顧客名は100文字以内で入力してください'),
  content: z.string().trim().min(1, '訪問内容は必須です').max(2000, '訪問内容は2000文字以内で入力してください'),
})

type SampleValues = z.infer<typeof sampleSchema>

const sampleReports = [
  { date: '2026/10/31（土）', staff: '山田太郎', visits: 3, status: 'submitted' },
  { date: '2026/10/30（金）', staff: '山田太郎', visits: 2, status: 'draft' },
  { date: '2026/10/30（金）', staff: '佐藤花子', visits: 4, status: 'submitted' },
] as const

export function UiSample() {
  const form = useForm<SampleValues>({
    resolver: zodResolver(sampleSchema),
    defaultValues: { customerName: '', content: '' },
  })

  function onSubmit(values: SampleValues) {
    toast.success('保存しました', { description: `${values.customerName}：${values.content}` })
    form.reset()
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">UI サンプル</h1>
        <p className="text-sm text-muted-foreground">shadcn/ui の部品の表示確認用（開発環境のみ）</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ボタン・ダイアログ・トースト</CardTitle>
          <CardDescription>確認ダイアログ（M-06 など）と完了トースト（M-09）の見た目</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success('提出しました')}>トーストを表示</Button>
          <Button variant="outline" onClick={() => toast.error('入力内容に誤りがあります')}>
            エラーのトースト
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">ダイアログを開く</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ダイアログ</DialogTitle>
                <DialogDescription>Esc キーまたは外側のクリックで閉じます。</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => toast('ダイアログのボタンを押しました')}>OK</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">確認ダイアログ</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>日報を提出します。よろしいですか？</AlertDialogTitle>
                <AlertDialogDescription>提出すると上長が閲覧できるようになります。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={() => toast.success('提出しました')}>提出する</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>フォーム（react-hook-form + Zod）</CardTitle>
          <CardDescription>空のまま保存すると、項目の下にエラーが表示されます</CardDescription>
        </CardHeader>
        <CardContent>
          <form id="ui-sample-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                name="customerName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>顧客名 *</FieldLabel>
                    <Input {...field} id={field.name} aria-invalid={fieldState.invalid} placeholder="ABC商事" />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="content"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>訪問内容 *</FieldLabel>
                    <Textarea
                      {...field}
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                      placeholder="新商品の提案。先方部長が興味あり。"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            クリア
          </Button>
          <Button type="submit" form="ui-sample-form">
            保存
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>テーブル・バッジ</CardTitle>
          <CardDescription>日報一覧（SC-02）の見た目</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>担当者</TableHead>
                <TableHead className="text-right">訪問件数</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleReports.map((report) => (
                <TableRow key={`${report.date}-${report.staff}`}>
                  <TableCell>{report.date}</TableCell>
                  <TableCell>{report.staff}</TableCell>
                  <TableCell className="text-right">{report.visits}</TableCell>
                  <TableCell>
                    {report.status === 'submitted' ? (
                      <Badge>提出済み</Badge>
                    ) : (
                      <Badge variant="outline">下書き</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}
