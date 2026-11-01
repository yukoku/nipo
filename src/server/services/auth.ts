import 'server-only'

import type { Role } from '@/generated/prisma/client'
import type { ApiRole } from '@/schemas/auth'
import { UnauthenticatedError } from '@/server/api/errors'
import { hashPassword, needsRehash, verifyPassword } from '@/server/auth/password'
import { prisma } from '@/server/db/prisma'

/** ログインに失敗したときのメッセージ（M-01）。理由（メール違い・パスワード違い・無効）によらず同じにする */
export const LOGIN_FAILED_MESSAGE = 'メールアドレスまたはパスワードが正しくありません'

/** A-01・A-03 で返すログインユーザーの情報（services の形。API の形への変換は response で行う） */
export interface CurrentUserProfile {
  id: number
  name: string
  email: string
  department: string | null
  role: ApiRole
  manager: { id: number; name: string } | null
  subordinates: { id: number; name: string }[]
  csrfToken: string
}

/**
 * メールアドレスとパスワードで認証し、営業の ID を返す。失敗したら `UnauthenticatedError`（401）。
 *
 * - メールアドレスは大文字・小文字を区別しない
 * - メールアドレスが存在しない・無効なアカウントでも、ダミーのハッシュで同じ計算をしてから失敗にする
 *   （応答時間の差からアカウントの有無を推測させない。決定事項 #25）
 * - ハッシュのパラメーターが古ければ、ログイン成功時に今の設定で作り直す
 */
export async function authenticate(email: string, password: string): Promise<number> {
  const staff = await prisma.salesStaff.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, passwordHash: true, isActive: true },
  })

  const ok = await verifyPassword(staff?.isActive ? staff.passwordHash : null, password)
  if (!ok || staff === null) {
    throw new UnauthenticatedError(LOGIN_FAILED_MESSAGE)
  }

  if (needsRehash(staff.passwordHash)) {
    await prisma.salesStaff.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(password) } })
  }
  return staff.id
}

/** ログインユーザーの情報（上長・有効な直属の部下・CSRF トークン）を返す */
export async function getCurrentUserProfile(staffId: number, csrfToken: string): Promise<CurrentUserProfile> {
  const staff = await prisma.salesStaff.findUniqueOrThrow({
    where: { id: staffId },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      role: true,
      manager: { select: { id: true, name: true } },
      subordinates: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { id: 'asc' } },
    },
  })
  return { ...staff, role: toApiRole(staff.role), csrfToken }
}

/** DB のロール（SALES など）を API の値（sales など）にする */
export function toApiRole(role: Role): ApiRole {
  return role.toLowerCase() as ApiRole
}
