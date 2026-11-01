/**
 * テストデータ（docs/test-spec.md §2.2）
 *
 * テスト仕様書がデータの ID を直接参照しているため（例：「suzuki で 104 を閲覧」）、ID を固定で定義する。
 * テストからはこのファイルの定数で ID を参照する（例：`SEED_STAFF.yamada.id`、`SEED_REPORTS.draft.id`）。
 *
 * 日時は「瞬間」なので `+09:00` 付きで書く。報告日・訪問時刻は暦の日付・時刻なので文字列のまま（@/lib/date）。
 */
import type { CommentTarget, ReportStatus, Role } from '@/generated/prisma/client'

/** 全員共通のパスワード */
export const SEED_PASSWORD = 'Passw0rd'

export type SeedStaff = {
  id: number
  name: string
  email: string
  role: Role
  department: string | null
  managerId: number | null
  isActive: boolean
}

/** 営業マスタ（ID 1〜7） */
export const SEED_STAFF = {
  suzuki: { id: 1, name: '鈴木一郎', email: 'suzuki@example.com', role: 'MANAGER', department: '営業1課', managerId: null, isActive: true },
  yamada: { id: 2, name: '山田太郎', email: 'yamada@example.com', role: 'SALES', department: '営業1課', managerId: 1, isActive: true },
  sato: { id: 3, name: '佐藤花子', email: 'sato@example.com', role: 'SALES', department: '営業1課', managerId: 1, isActive: true },
  tanaka: { id: 4, name: '田中次郎', email: 'tanaka@example.com', role: 'MANAGER', department: '営業2課', managerId: null, isActive: true },
  ito: { id: 5, name: '伊藤三郎', email: 'ito@example.com', role: 'SALES', department: '営業2課', managerId: 4, isActive: true },
  admin: { id: 6, name: '管理者', email: 'admin@example.com', role: 'ADMIN', department: null, managerId: null, isActive: true },
  retired: { id: 7, name: '退職者', email: 'retired@example.com', role: 'SALES', department: '営業1課', managerId: 1, isActive: false },
} as const satisfies Record<string, SeedStaff>

export type SeedCustomer = {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  address: string | null
  assignedSalesId: number | null
  isActive: boolean
}

/** 顧客マスタ（ID 10〜13） */
export const SEED_CUSTOMERS = {
  abc: { id: 10, name: 'ABC商事', contactPerson: '田中様', phone: '03-1234-5678', address: '東京都千代田区丸の内1-1-1', assignedSalesId: 2, isActive: true },
  xyz: { id: 11, name: 'XYZ工業', contactPerson: '高橋様', phone: '06-1234-5678', address: '大阪府大阪市北区梅田1-1-1', assignedSalesId: 2, isActive: true },
  def: { id: 12, name: 'DEF物産', contactPerson: '渡辺様', phone: '052-123-4567', address: '愛知県名古屋市中村区名駅1-1-1', assignedSalesId: 3, isActive: true },
  old: { id: 13, name: '旧取引先', contactPerson: null, phone: null, address: null, assignedSalesId: 2, isActive: false },
} as const satisfies Record<string, SeedCustomer>

export type SeedVisit = {
  id: number
  customerId: number
  /** 訪問時刻（HH:mm）。任意 */
  visitedAt: string | null
  content: string
}

export type SeedComment = {
  id: number
  commenterId: number
  target: CommentTarget
  body: string
  createdAt: string
}

export type SeedReport = {
  id: number
  salesStaffId: number
  /** 報告日（YYYY-MM-DD） */
  reportDate: string
  status: ReportStatus
  problem: string | null
  plan: string | null
  /** 作成日時。提出済みなら提出日時も同じにする */
  createdAt: string
  submittedAt: string | null
  /** 配列の順が表示順（sort_order） */
  visits: readonly SeedVisit[]
  comments: readonly SeedComment[]
}

/** 日報（ID 100〜105）と訪問記録（ID 501〜）・コメント（ID 801〜） */
export const SEED_REPORTS = {
  /** 100：山田・提出済み・コメントあり（編集不可の日報） */
  commented: {
    id: 100,
    salesStaffId: 2,
    reportDate: '2026-10-29',
    status: 'SUBMITTED',
    problem: 'XYZ工業の値引き要求にどこまで応じるべきか相談したい。',
    plan: 'ABC商事へ資料送付、DEF社アポ取り',
    createdAt: '2026-10-29T18:00:00+09:00',
    submittedAt: '2026-10-29T18:00:00+09:00',
    visits: [
      { id: 501, customerId: 10, visitedAt: '10:00', content: '新商品の提案。先方部長が興味あり。' },
      { id: 502, customerId: 11, visitedAt: '14:30', content: '見積提出。値引きの要望あり。' },
    ],
    comments: [
      { id: 801, commenterId: 1, target: 'PROBLEM', body: '5%までなら即決OK。それ以上は相談して。', createdAt: '2026-10-29T19:10:00+09:00' },
    ],
  },
  /** 101：山田・提出済み・コメントなし（編集可能な提出済み日報） */
  submitted: {
    id: 101,
    salesStaffId: 2,
    reportDate: '2026-10-30',
    status: 'SUBMITTED',
    problem: '見積の回答待ちが続いている。',
    plan: 'XYZ工業へ電話で状況確認',
    createdAt: '2026-10-30T18:30:00+09:00',
    submittedAt: '2026-10-30T18:30:00+09:00',
    visits: [{ id: 503, customerId: 11, visitedAt: '11:00', content: '見積の補足説明。来週回答予定。' }],
    comments: [],
  },
  /** 102：山田・下書き */
  draft: {
    id: 102,
    salesStaffId: 2,
    reportDate: '2026-10-28',
    status: 'DRAFT',
    problem: '提案資料の作り直しが必要。',
    plan: null,
    createdAt: '2026-10-28T17:00:00+09:00',
    submittedAt: null,
    visits: [{ id: 504, customerId: 10, visitedAt: null, content: '定例の打ち合わせ。' }],
    comments: [],
  },
  /** 103：佐藤・提出済み */
  satoSubmitted: {
    id: 103,
    salesStaffId: 3,
    reportDate: '2026-10-30',
    status: 'SUBMITTED',
    problem: '新規開拓のリストが不足している。',
    plan: 'DEF物産の紹介先へアポ取り',
    createdAt: '2026-10-30T19:00:00+09:00',
    submittedAt: '2026-10-30T19:00:00+09:00',
    visits: [{ id: 505, customerId: 12, visitedAt: '13:00', content: '新製品の説明。好感触。' }],
    comments: [],
  },
  /** 104：佐藤・下書き（上長から見えない） */
  satoDraft: {
    id: 104,
    salesStaffId: 3,
    reportDate: '2026-10-29',
    status: 'DRAFT',
    problem: null,
    plan: null,
    createdAt: '2026-10-29T17:30:00+09:00',
    submittedAt: null,
    visits: [{ id: 506, customerId: 12, visitedAt: '15:00', content: '納品の立ち会い。' }],
    comments: [],
  },
  /** 105：伊藤・提出済み（別チームの日報） */
  otherTeam: {
    id: 105,
    salesStaffId: 5,
    reportDate: '2026-10-30',
    status: 'SUBMITTED',
    problem: '特になし。',
    plan: '既存顧客への定期訪問',
    createdAt: '2026-10-30T18:00:00+09:00',
    submittedAt: '2026-10-30T18:00:00+09:00',
    visits: [{ id: 507, customerId: 11, visitedAt: '10:30', content: '保守契約の更新の相談。' }],
    comments: [],
  },
} as const satisfies Record<string, SeedReport>
