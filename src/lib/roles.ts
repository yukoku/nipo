import type { Role } from '@/generated/prisma/client'
import type { ApiRole } from '@/schemas/auth'

/** API のロールの値（`sales`）を、DB のロールの値（`SALES`）にする。画面で `homePathForRole()` などに渡すときに使う */
export function fromApiRole(role: ApiRole): Role {
  const roles = { sales: 'SALES', manager: 'MANAGER', admin: 'ADMIN' } as const satisfies Record<ApiRole, Role>
  return roles[role]
}
