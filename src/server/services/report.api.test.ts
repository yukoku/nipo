import { describe, expect, it } from 'vitest'

import { ForbiddenError } from '@/server/api/errors'
import { prisma } from '@/server/db/prisma'
import { SEED_REPORTS, SEED_STAFF } from '@/server/db/seed/data'

import { findOwnReportId, listReportSubordinateOptions } from './report'

const yamada = { id: SEED_STAFF.yamada.id, role: 'SALES' } as const
const suzuki = { id: SEED_STAFF.suzuki.id, role: 'MANAGER' } as const
const admin = { id: SEED_STAFF.admin.id, role: 'ADMIN' } as const

describe('listReportSubordinateOptions（SC-02 の担当者セレクト）', () => {
  it('T-UI-04: 上長には、有効な直属の部下を ID の順に返す（無効な退職者は含まない）', async () => {
    expect(await listReportSubordinateOptions(suzuki)).toEqual([
      { id: SEED_STAFF.yamada.id, name: '山田太郎' },
      { id: SEED_STAFF.sato.id, name: '佐藤花子' },
    ])
  })

  it('営業には空（担当者セレクトを出さない）', async () => {
    expect(await listReportSubordinateOptions(yamada)).toEqual([])
  })

  it('管理者は使えない', async () => {
    await expect(listReportSubordinateOptions(admin)).rejects.toThrow(ForbiddenError)
  })
})

describe('findOwnReportId（今日の日報を書く）', () => {
  it('自分のその日の日報があれば ID、なければ null', async () => {
    expect(await findOwnReportId(yamada, '2026-10-30')).toBe(SEED_REPORTS.submitted.id)
    expect(await findOwnReportId(yamada, '2026-10-31')).toBeNull()
  })

  it('他の人の同じ日の日報は見ない', async () => {
    await prisma.dailyReport.create({
      data: { salesStaffId: SEED_STAFF.sato.id, reportDate: new Date('2026-10-31T00:00:00Z'), status: 'DRAFT' },
    })

    expect(await findOwnReportId(yamada, '2026-10-31')).toBeNull()
  })

  it('管理者は使えない', async () => {
    await expect(findOwnReportId(admin, '2026-10-31')).rejects.toThrow(ForbiddenError)
  })
})
