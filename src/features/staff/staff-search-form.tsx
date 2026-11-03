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

/**
 * 部署の「全て」（絞り込まない）を表す値。Select は空文字の値を使えないため。
 * 部署はフリーテキスト（決定事項 #10）なので、入力されそうにない値にする
 */
const ALL = '__all__'

export interface StaffSearchValues {
  name: string
  department: string | null
  includeInactive: boolean
}

interface StaffSearchFormProps {
  /** 今の検索条件（URL のクエリから読んだ値） */
  initialValues: StaffSearchValues
  /** 部署の選択肢（登録済みの部署） */
  departments: string[]
}

/**
 * 営業一覧（SC-07）の検索条件。検索すると条件を URL のクエリに入れて、1 ページ目から表示し直す
 */
export function StaffSearchForm({ initialValues, departments }: StaffSearchFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialValues.name)
  const [department, setDepartment] = useState(initialValues.department ?? ALL)
  const [includeInactive, setIncludeInactive] = useState(initialValues.includeInactive)

  // URL で指定された部署が選択肢にない（その部署の人がいなくなった など）ときも、選ばれたまま表示する
  const options =
    initialValues.department !== null && !departments.includes(initialValues.department)
      ? [...departments, initialValues.department]
      : departments

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    router.push(
      `/staff${buildQueryString({
        name: name.trim(),
        department: department === ALL ? null : department,
        include_inactive: includeInactive,
      })}`,
    )
  }

  return (
    <form role="search" aria-label="営業担当者の検索" onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-1.5 md:w-64">
        <Label htmlFor="search-name">氏名</Label>
        <Input id="search-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} />
      </div>
      <div className="flex flex-col gap-1.5 md:w-48">
        <Label htmlFor="search-department">部署</Label>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger id="search-department" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全て</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
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
