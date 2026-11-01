import { redirect } from 'next/navigation'

import { homePathForRole } from '@/lib/routes'
import { requirePageUser } from '@/server/auth/page-auth'

/** トップ画面。ロールごとの画面（営業・上長は日報一覧、管理者は顧客一覧）へ振り分ける */
export default async function HomePage() {
  const user = await requirePageUser()
  redirect(homePathForRole(user.role))
}
