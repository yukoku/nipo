'use client'

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PlusIcon, XIcon } from 'lucide-react'
import { useId } from 'react'
import { type Control, Controller, type FieldErrors, type UseFieldArrayReturn } from 'react-hook-form'

import { FormField, controlProps } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { REPORT_LIMITS } from '@/schemas/report'

import { type CustomerOption, CustomerCombobox } from './customer-combobox'

/** 訪問記録の 1 行（フォームの値。API と同じ snake_case） */
export interface VisitRecordFormValue {
  /** 既存の行の ID（新しい行にはない） */
  id?: number
  /** 未選択なら null */
  customer_id: number | null
  /** 未入力なら空文字 */
  visited_at: string
  content: string
}

/** 訪問記録の入力欄が扱うフォームの値 */
export interface VisitRecordsFormValues {
  visit_records: VisitRecordFormValue[]
}

/** 「訪問記録を追加」で足す空の行 */
export const EMPTY_VISIT_RECORD: VisitRecordFormValue = { customer_id: null, visited_at: '', content: '' }

/** 何も入力していない行か（送信する前に取り除く。docs/api.md R-02） */
export function isEmptyVisitRecord(record: VisitRecordFormValue): boolean {
  return record.customer_id === null && record.visited_at.trim() === '' && record.content.trim() === ''
}

/** `useFieldArray` の行。行の識別子は `key`（`id` は既存の行の ID に使うため） */
type VisitRecordFieldArray = UseFieldArrayReturn<VisitRecordsFormValues, 'visit_records', 'key'>

interface VisitRecordsFieldProps {
  // フォーム全体の型は呼び出し側で決まるため、訪問記録の部分だけを見る
  control: Control<VisitRecordsFormValues>
  fieldArray: VisitRecordFieldArray
  errors: FieldErrors<VisitRecordsFormValues>['visit_records']
  /** 選べる顧客（有効な顧客だけ） */
  customerOptions: readonly CustomerOption[]
  /** 顧客 ID → 表示名（無効になった顧客の名前も含む） */
  customerLabels: ReadonlyMap<number, string>
}

/** ドラッグで並べ替えるときの読み上げ（dnd-kit の既定は英語のため） */
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable: 'スペースキーで行を持ち上げ、上下の矢印キーで移動し、スペースキーで置きます。Esc キーで取りやめます。',
}

function rowNumber(id: string | number, keys: readonly string[]): number {
  return keys.indexOf(String(id)) + 1
}

/**
 * 訪問記録の入力欄（SC-03）
 *
 * - 行の追加（末尾に空の行。最大 20 行。T-UI-11）・削除（確認なし）
 * - ドラッグハンドルで並べ替える。キーボードでも並べ替えられる（ハンドルでスペース → 矢印キー → スペース）
 * - 顧客は検索付きセレクト（有効な顧客だけ。T-UI-12）。時刻は任意
 * - エラーは該当する行の項目の下に出す（`visit_records[1].content` は 2 行目）
 * - スマートフォン幅では 1 行をカードにして縦に並べる
 */
export function VisitRecordsField({
  control,
  fieldArray,
  errors,
  customerOptions,
  customerLabels,
}: VisitRecordsFieldProps) {
  const { fields, append, remove, move } = fieldArray
  // dnd-kit が作る id をサーバーとブラウザでそろえる（そろわないとハイドレーションのエラーになる）
  const dndId = useId()
  const keys = fields.map((field) => field.key)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${rowNumber(active.id, keys)}行目を持ち上げました`,
    onDragOver: ({ active, over }) =>
      over ? `${rowNumber(active.id, keys)}行目を${rowNumber(over.id, keys)}行目の位置に移動します` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${rowNumber(active.id, keys)}行目を${rowNumber(over.id, keys)}行目に移動しました` : undefined,
    onDragCancel: ({ active }) => `${rowNumber(active.id, keys)}行目の移動を取りやめました`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) {
      return
    }
    move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))
  }

  const full = fields.length >= REPORT_LIMITS.visitRecords
  // 行の数の上限など、配列全体のエラー
  const listError = errors?.root?.message ?? errors?.message

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          訪問記録はありません（訪問がない日は、このまま保存・提出できます）
        </p>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ol aria-label="訪問記録" className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <VisitRecordRow
                  key={field.key}
                  sortableId={field.key}
                  index={index}
                  control={control}
                  errors={errors?.[index]}
                  customerOptions={customerOptions}
                  customerLabels={customerLabels}
                  onRemove={() => remove(index)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {listError !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {listError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => append(EMPTY_VISIT_RECORD)} disabled={full}>
          <PlusIcon aria-hidden />
          訪問記録を追加
        </Button>
        <span className="text-sm text-muted-foreground">
          {fields.length} / {REPORT_LIMITS.visitRecords} 件
        </span>
      </div>
    </div>
  )
}

interface VisitRecordRowProps {
  sortableId: string
  index: number
  control: Control<VisitRecordsFormValues>
  errors: NonNullable<FieldErrors<VisitRecordsFormValues>['visit_records']>[number] | undefined
  customerOptions: readonly CustomerOption[]
  customerLabels: ReadonlyMap<number, string>
  onRemove: () => void
}

/** 訪問記録の 1 行。PC では横に並べ、スマートフォン幅ではカードにする */
function VisitRecordRow({
  sortableId,
  index,
  control,
  errors,
  customerOptions,
  customerLabels,
  onRemove,
}: VisitRecordRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    attributes: { roleDescription: '並べ替えできる行' },
  })
  const number = index + 1
  const prefix = `visit_records-${index}`
  // 他の日報の訪問記録・重複した ID など、行そのもののエラー
  const rowError = errors?.id?.message

  return (
    <li
      ref={setNodeRef}
      aria-label={`訪問記録 ${number}行目`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3', isDragging && 'relative z-10 shadow-lg')}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex items-center justify-between md:contents">
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`${number}行目を並べ替え`}
            className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing md:mt-6"
          >
            <GripVerticalIcon aria-hidden className="size-4" />
          </button>
          <span className="text-sm font-medium md:hidden">{number}行目</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`${number}行目を削除`}
            className="md:order-last md:mt-6"
          >
            <XIcon aria-hidden />
          </Button>
        </div>

        <Controller
          name={`visit_records.${index}.customer_id`}
          control={control}
          render={({ field, fieldState }) => (
            <FormField
              id={`${prefix}-customer_id`}
              label="顧客"
              required
              error={fieldState.error}
              className="md:w-56 md:shrink-0"
            >
              <CustomerCombobox
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={customerOptions}
                selectedLabel={field.value === null ? undefined : customerLabels.get(field.value)}
                {...controlProps(`${prefix}-customer_id`, fieldState.error)}
              />
            </FormField>
          )}
        />

        <Controller
          name={`visit_records.${index}.visited_at`}
          control={control}
          render={({ field, fieldState }) => (
            <FormField
              id={`${prefix}-visited_at`}
              label="時刻"
              error={fieldState.error}
              className="md:w-32 md:shrink-0"
            >
              <Input {...field} {...controlProps(`${prefix}-visited_at`, fieldState.error)} type="time" />
            </FormField>
          )}
        />

        <Controller
          name={`visit_records.${index}.content`}
          control={control}
          render={({ field, fieldState }) => (
            <FormField
              id={`${prefix}-content`}
              label="訪問内容"
              required
              error={fieldState.error}
              className="md:flex-1"
            >
              <Textarea
                {...field}
                {...controlProps(`${prefix}-content`, fieldState.error)}
                rows={2}
                maxLength={REPORT_LIMITS.text}
              />
            </FormField>
          )}
        />
      </div>

      {rowError !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {rowError}
        </p>
      )}
    </li>
  )
}
