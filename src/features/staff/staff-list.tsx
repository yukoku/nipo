import Link from 'next/link'

import { LinkRow } from '@/components/link-row'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROLE_LABELS } from '@/lib/roles'
import type { ApiRole } from '@/schemas/auth'

export interface StaffListItem {
  id: number
  name: string
  email: string
  department: string | null
  role: ApiRole
  manager: { id: number; name: string } | null
  isActive: boolean
}

/** 未設定の項目の表示 */
const EMPTY = '-'

export const staffEditPath = (id: number) => `/staff/${id}`

/**
 * 営業一覧（SC-07）の一覧部分。PC 幅では表、スマートフォン幅ではカードで表示する（docs/screens.md §3.2）。
 * 行（カード）を押すと営業の編集画面（SC-08）へ移る
 */
export function StaffList({ staff }: { staff: StaffListItem[] }) {
  if (staff.length === 0) {
    return <p className="rounded-lg border p-8 text-center text-muted-foreground">該当する営業担当者はいません</p>
  }

  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="営業担当者の一覧">
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>部署</TableHead>
              <TableHead>権限</TableHead>
              <TableHead>上長</TableHead>
              <TableHead>状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((person) => (
              <LinkRow key={person.id} href={staffEditPath(person.id)}>
                <TableCell className="font-medium">
                  <Link href={staffEditPath(person.id)} className="hover:underline">
                    {person.name}
                  </Link>
                </TableCell>
                <TableCell>{person.email}</TableCell>
                <TableCell>{person.department ?? EMPTY}</TableCell>
                <TableCell>{ROLE_LABELS[person.role]}</TableCell>
                <TableCell>{person.manager?.name ?? EMPTY}</TableCell>
                <TableCell>
                  <StatusBadge isActive={person.isActive} />
                </TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="営業担当者の一覧" className="flex flex-col gap-2 md:hidden">
        {staff.map((person) => (
          <li key={person.id}>
            <Link
              href={staffEditPath(person.id)}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{person.name}</span>
                <StatusBadge isActive={person.isActive} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">メール</dt>
                <dd className="break-all">{person.email}</dd>
                <dt className="text-muted-foreground">部署</dt>
                <dd>{person.department ?? EMPTY}</dd>
                <dt className="text-muted-foreground">権限</dt>
                <dd>{ROLE_LABELS[person.role]}</dd>
                <dt className="text-muted-foreground">上長</dt>
                <dd>{person.manager?.name ?? EMPTY}</dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge variant="secondary">有効</Badge> : <Badge variant="outline">無効</Badge>
}
