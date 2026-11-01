'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildQueryString } from '@/lib/list-query'

/** 担当営業の「全員」（絞り込まない）を表す値。Select は空文字の値を使えないため */
const ALL = 'all'

export interface CustomerSearchValues {
  name: string
  assignedSalesId: number | null
  includeInactive: boolean
}

interface CustomerSearchFormProps {
  /** 今の検索条件（URL のクエリから読んだ値） */
  initialValues: CustomerSearchValues
  /** 担当営業の選択肢 */
  staffOptions: { id: number; name: string }[]
}

/**
 * 顧客一覧（SC-05）の検索条件。検索すると条件を URL のクエリに入れて、1 ページ目から表示し直す
 */
export function CustomerSearchForm({ initialValues, staffOptions }: CustomerSearchFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialValues.name)
  const [assignedSales, setAssignedSales] = useState(
    initialValues.assignedSalesId === null ? ALL : String(initialValues.assignedSalesId),
  )
  const [includeInactive, setIncludeInactive] = useState(initialValues.includeInactive)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    router.push(
      `/customers${buildQueryString({
        name: name.trim(),
        assigned_sales_id: assignedSales === ALL ? null : assignedSales,
        include_inactive: includeInactive,
      })}`,
    )
  }

  return (
    <form role="search" aria-label="顧客の検索" onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-1.5 md:w-64">
        <Label htmlFor="search-name">顧客名</Label>
        <Input id="search-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
      </div>
      <div className="flex flex-col gap-1.5 md:w-48">
        <Label htmlFor="search-assigned-sales">担当営業</Label>
        <Select value={assignedSales} onValueChange={setAssignedSales}>
          <SelectTrigger id="search-assigned-sales" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全員</SelectItem>
            {staffOptions.map((staff) => (
              <SelectItem key={staff.id} value={String(staff.id)}>
                {staff.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 md:h-8">
        <Checkbox
          id="search-include-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setIncludeInactive(checked === true)}
        />
        <Label htmlFor="search-include-inactive">無効も表示</Label>
      </div>
      <Button type="submit" className="md:ml-auto">
        <Search aria-hidden />
        検索
      </Button>
    </form>
  )
}
