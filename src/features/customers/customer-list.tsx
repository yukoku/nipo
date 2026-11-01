import Link from 'next/link'

import { LinkRow } from '@/components/link-row'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface CustomerListItem {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  assignedSales: { id: number; name: string } | null
  isActive: boolean
}

/** 未設定の項目の表示 */
const EMPTY = '-'

export const customerEditPath = (id: number) => `/customers/${id}`

/**
 * 顧客一覧（SC-05）の一覧部分。PC 幅では表、スマートフォン幅ではカードで表示する（docs/screens.md §3.2）。
 * 行（カード）を押すと顧客の編集画面（SC-06）へ移る
 */
export function CustomerList({ customers }: { customers: CustomerListItem[] }) {
  if (customers.length === 0) {
    return <p className="rounded-lg border p-8 text-center text-muted-foreground">該当する顧客はありません</p>
  }

  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="顧客の一覧">
          <TableHeader>
            <TableRow>
              <TableHead>顧客名</TableHead>
              <TableHead>先方担当者</TableHead>
              <TableHead>電話番号</TableHead>
              <TableHead>担当営業</TableHead>
              <TableHead>状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <LinkRow key={customer.id} href={customerEditPath(customer.id)}>
                <TableCell className="font-medium">
                  <Link href={customerEditPath(customer.id)} className="hover:underline">
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell>{customer.contactPerson ?? EMPTY}</TableCell>
                <TableCell>{customer.phone ?? EMPTY}</TableCell>
                <TableCell>{customer.assignedSales?.name ?? EMPTY}</TableCell>
                <TableCell>
                  <StatusBadge isActive={customer.isActive} />
                </TableCell>
              </LinkRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="顧客の一覧" className="flex flex-col gap-2 md:hidden">
        {customers.map((customer) => (
          <li key={customer.id}>
            <Link
              href={customerEditPath(customer.id)}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{customer.name}</span>
                <StatusBadge isActive={customer.isActive} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">先方担当者</dt>
                <dd>{customer.contactPerson ?? EMPTY}</dd>
                <dt className="text-muted-foreground">電話番号</dt>
                <dd>{customer.phone ?? EMPTY}</dd>
                <dt className="text-muted-foreground">担当営業</dt>
                <dd>{customer.assignedSales?.name ?? EMPTY}</dd>
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
