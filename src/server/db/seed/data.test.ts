import { describe, expect, it } from 'vitest'

import { isFutureDate, isValidDateString, isValidTimeString } from '@/lib/date'
import { TEST_BASE_DATE } from '@/test/time'

import type { SeedCustomer, SeedReport, SeedStaff, SeedVisit } from './data'
import { SEED_CUSTOMERS, SEED_REPORTS, SEED_STAFF } from './data'

// data.ts は `as const` でリテラル型になっているため、ここでは一般的な型として扱う
// （リテラル型のままだと「下書きなのに提出日時がある」といった絞り込みが型の上で never になる）
const staff: readonly SeedStaff[] = Object.values(SEED_STAFF)
const customers: readonly SeedCustomer[] = Object.values(SEED_CUSTOMERS)
const reports: readonly SeedReport[] = Object.values(SEED_REPORTS)
const visits: readonly SeedVisit[] = reports.flatMap((r) => r.visits)
const staffById = new Map<number, SeedStaff>(staff.map((s) => [s.id, s]))
const customerIds = new Set<number>(customers.map((c) => c.id))

/** 重複している値を返す */
function duplicates<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) !== index)
}

// 各テストは「条件を満たさないデータの一覧が空であること」を確かめる。失敗したときに、どのデータが違反しているかが表示される
describe('テストデータ（docs/test-spec.md §2.2）', () => {
  it('ID がテスト仕様書どおり（営業 1〜7、顧客 10〜13、日報 100〜105）', () => {
    expect(staff.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(customers.map((c) => c.id)).toEqual([10, 11, 12, 13])
    expect(reports.map((r) => r.id)).toEqual([100, 101, 102, 103, 104, 105])
  })

  it('ID・メールアドレスに重複がない', () => {
    expect(duplicates(staff.map((s) => s.id))).toEqual([])
    expect(duplicates(staff.map((s) => s.email))).toEqual([])
    expect(duplicates(customers.map((c) => c.id))).toEqual([])
    expect(duplicates(visits.map((v) => v.id))).toEqual([])
    expect(duplicates(reports.flatMap((r) => r.comments.map((c) => c.id)))).toEqual([])
  })

  describe('営業マスタ', () => {
    it('上長に指定されているのは、有効な manager ロールの営業だけ', () => {
      const invalid = staff.filter((s) => {
        if (s.managerId === null) return false
        const manager = staffById.get(s.managerId)
        return manager?.role !== 'MANAGER' || !manager.isActive
      })
      expect(invalid.map((s) => s.name)).toEqual([])
    })

    it('鈴木の直属の有効な部下は山田・佐藤の 2 人（T-STF-12・T-AUTH-09 の前提）', () => {
      const subordinates = staff.filter((s) => s.managerId === SEED_STAFF.suzuki.id)
      expect(subordinates.filter((s) => s.isActive).map((s) => s.name)).toEqual(['山田太郎', '佐藤花子'])
      expect(subordinates.filter((s) => !s.isActive).map((s) => s.name)).toEqual(['退職者'])
    })
  })

  describe('顧客マスタ', () => {
    it('担当営業は存在する営業', () => {
      const invalid = customers.filter((c) => c.assignedSalesId !== null && !staffById.has(c.assignedSalesId))
      expect(invalid.map((c) => c.name)).toEqual([])
    })

    it('無効な顧客は旧取引先（13）だけ（T-RPT-10・T-CUS-06 の前提）', () => {
      expect(customers.filter((c) => !c.isActive).map((c) => c.id)).toEqual([13])
    })
  })

  describe('日報', () => {
    it('同じ担当者・同じ報告日の日報がない（1人1日1件）', () => {
      expect(duplicates(reports.map((r) => `${r.salesStaffId}:${r.reportDate}`))).toEqual([])
    })

    it('報告日は正しい日付で、基準日（2026-10-31）より後ではない', () => {
      const invalid = reports.filter((r) => !isValidDateString(r.reportDate) || isFutureDate(r.reportDate, TEST_BASE_DATE))
      expect(invalid.map((r) => r.id)).toEqual([])
    })

    it('提出済みの日報は提出日時と Problem・Plan を持ち、下書きは提出日時を持たない', () => {
      const invalidSubmitted = reports.filter(
        (r) => r.status === 'SUBMITTED' && (r.submittedAt === null || !r.problem || !r.plan),
      )
      const invalidDrafts = reports.filter((r) => r.status === 'DRAFT' && r.submittedAt !== null)
      expect(invalidSubmitted.map((r) => r.id)).toEqual([])
      expect(invalidDrafts.map((r) => r.id)).toEqual([])
    })

    it('担当者・状態・コメントの有無がテスト仕様書どおり', () => {
      const summary = reports.map((r) => [r.id, staffById.get(r.salesStaffId)?.name, r.status, r.comments.length])
      expect(summary).toEqual([
        [100, '山田太郎', 'SUBMITTED', 1],
        [101, '山田太郎', 'SUBMITTED', 0],
        [102, '山田太郎', 'DRAFT', 0],
        [103, '佐藤花子', 'SUBMITTED', 0],
        [104, '佐藤花子', 'DRAFT', 0],
        [105, '伊藤三郎', 'SUBMITTED', 0],
      ])
    })

    it('訪問記録の顧客は存在する顧客で、時刻は正しい形式', () => {
      const invalid = visits.filter(
        (v) => !customerIds.has(v.customerId) || (v.visitedAt !== null && !isValidTimeString(v.visitedAt)),
      )
      expect(invalid.map((v) => v.id)).toEqual([])
    })

    it('コメントしたのは日報作成者の直属の上長で、日報は提出済み（コメント可能条件）', () => {
      const invalid = reports.flatMap((r) =>
        r.comments.filter(
          (c) => c.commenterId !== staffById.get(r.salesStaffId)?.managerId || r.status !== 'SUBMITTED',
        ),
      )
      expect(invalid.map((c) => c.id)).toEqual([])
    })
  })
})
