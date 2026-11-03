'use client'

import { ChevronsUpDownIcon } from 'lucide-react'
import { type Ref, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** 顧客の選択肢 */
export interface CustomerOption {
  id: number
  name: string
}

interface CustomerComboboxProps {
  /** ボタンの id（ラベルと結び付ける） */
  id: string
  value: number | null
  onChange: (value: number) => void
  onBlur?: () => void
  /** 選べる顧客（有効な顧客だけ） */
  options: readonly CustomerOption[]
  /** 選ばれている顧客の表示名（選択肢にない、無効になった顧客の名前も引けるようにする） */
  selectedLabel: string | undefined
  ref?: Ref<HTMLButtonElement>
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** 顧客名の部分一致（大文字・小文字を区別しない） */
function filterByName(_value: string, search: string, keywords?: string[]): number {
  const name = (keywords ?? []).join(' ').toLowerCase()
  return name.includes(search.trim().toLowerCase()) ? 1 : 0
}

/**
 * 顧客の検索付きセレクト（SC-03 の訪問記録）。顧客名の一部を入力して絞り込める（T-UI-12）
 */
export function CustomerCombobox({
  id,
  value,
  onChange,
  onBlur,
  options,
  selectedLabel,
  ref,
  ...aria
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', value === null && 'text-muted-foreground')}
          {...aria}
        >
          <span className="truncate">{selectedLabel ?? '顧客を選択'}</span>
          <ChevronsUpDownIcon aria-hidden className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        {/* 入力欄・一覧の読み上げ名は cmdk の label で付ける（aria-label は上書きされる） */}
        <Command label="顧客名で絞り込み" filter={filterByName}>
          <CommandInput placeholder="顧客名で絞り込み" />
          <CommandList label="顧客">
            <CommandEmpty>該当する顧客はありません</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={String(option.id)}
                keywords={[option.name]}
                data-checked={option.id === value}
                onSelect={() => {
                  onChange(option.id)
                  setOpen(false)
                  onBlur?.()
                }}
              >
                <span className="truncate">{option.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
