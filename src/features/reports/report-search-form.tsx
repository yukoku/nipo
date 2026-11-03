'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildQueryString } from '@/lib/list-query'
import { CUSTOMER_LIMITS } from '@/schemas/customer'
import { DATE_RANGE_ORDER_MESSAGE } from '@/schemas/report'

/** 担当者の「全員」（絞り込まない）を表す値。Select は空文字の値を使えないため */
const ALL = 'all'

export interface ReportSearchValues {
  dateFrom: string
  dateTo: string
  salesStaffId: number | null
  customerName: string
}

interface ReportSearchFormProps {
  /** 今の検索条件（URL のクエリから読んだ値。期間は初期値を当てはめた後） */
  initialValues: ReportSearchValues
  /**
   * 担当者の選択肢（先頭が「自分」、続いて直属の部下。「全員」はこの部品が足す）。上長のときだけ渡す。
   * 渡さない（営業）ときは担当者のセレクトを出さない（docs/screens.md SC-02・T-UI-04）
   */
  staffOptions?: { id: number; name: string }[]
}

/**
 * 日報一覧（SC-02）の検索条件。検索すると条件を URL のクエリに入れて、1 ページ目から表示し直す。
 * 詳細画面から戻っても条件が残るようにするため、条件は URL にだけ持つ（T-UI-06）
 */
export function ReportSearchForm({ initialValues, staffOptions }: ReportSearchFormProps) {
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(initialValues.dateFrom)
  const [dateTo, setDateTo] = useState(initialValues.dateTo)
  const [salesStaff, setSalesStaff] = useState(
    initialValues.salesStaffId === null ? ALL : String(initialValues.salesStaffId),
  )
  const [customerName, setCustomerName] = useState(initialValues.customerName)
  const [rangeError, setRangeError] = useState(false)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    // 期間（終了）は期間（開始）以降であること（`YYYY-MM-DD` は文字列の大小がそのまま日付の前後）
    if (dateFrom !== '' && dateTo !== '' && dateTo < dateFrom) {
      setRangeError(true)
      return
    }
    setRangeError(false)
    router.push(
      `/reports${buildQueryString({
        date_from: dateFrom,
        date_to: dateTo,
        sales_staff_id: salesStaff === ALL ? null : salesStaff,
        customer_name: customerName.trim(),
      })}`,
    )
  }

  return (
    <form role="search" aria-label="日報の検索" onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">期間</legend>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="期間（開始）"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full md:w-40"
            />
            <span aria-hidden>〜</span>
            <Input
              type="date"
              aria-label="期間（終了）"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-invalid={rangeError || undefined}
              aria-describedby={rangeError ? 'search-date-range-error' : undefined}
              className="w-full md:w-40"
            />
          </div>
        </fieldset>
        {staffOptions !== undefined && (
          <div className="flex flex-col gap-1.5 md:w-44">
            <Label htmlFor="search-sales-staff">担当者</Label>
            <Select value={salesStaff} onValueChange={setSalesStaff}>
              <SelectTrigger id="search-sales-staff" className="w-full">
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
        )}
        <div className="flex flex-col gap-1.5 md:w-56">
          <Label htmlFor="search-customer-name">顧客</Label>
          <Input
            id="search-customer-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={CUSTOMER_LIMITS.name}
            placeholder="顧客名の一部"
          />
        </div>
        <Button type="submit" className="md:ml-auto">
          <Search aria-hidden />
          検索
        </Button>
      </div>
      {rangeError && (
        <p id="search-date-range-error" role="alert" className="text-sm text-destructive">
          {DATE_RANGE_ORDER_MESSAGE}
        </p>
      )}
    </form>
  )
}
