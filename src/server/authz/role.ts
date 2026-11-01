import "server-only";

import type { Role } from "@/generated/prisma/client";
import { ForbiddenError } from "@/server/api/errors";

import type { AuthzUser } from "./report";

/**
 * ログインユーザーのロールが、指定したロールのどれかであることを確かめる。違えば `ForbiddenError`（403）。
 *
 * @example
 * requireRole(user, 'ADMIN')                 // マスタの登録・更新（M-02・S-02 など）
 * requireRole(user, 'SALES', 'MANAGER')      // 日報の作成（管理者は不可。T-RPT-16）
 */
export function requireRole(
  user: AuthzUser,
  ...roles: [Role, ...Role[]]
): void {
  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }
}

/** ロールが指定したロールのどれかか（例外を投げない版。画面の出し分けなどに使う） */
export function hasRole(user: AuthzUser, ...roles: [Role, ...Role[]]): boolean {
  return roles.includes(user.role);
}
