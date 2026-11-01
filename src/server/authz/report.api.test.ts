import { describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { SEED_REPORTS, SEED_STAFF } from "@/server/db/seed/data";

import {
  type AuthzReport,
  canViewReport,
  viewableReportsWhere,
} from "./report";

/** テスト用DB の全日報を、判定に使う形で取り出す */
async function allReports(): Promise<(AuthzReport & { id: number })[]> {
  const rows = await prisma.dailyReport.findMany({
    select: {
      id: true,
      salesStaffId: true,
      status: true,
      salesStaff: { select: { managerId: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    salesStaffId: r.salesStaffId,
    authorManagerId: r.salesStaff.managerId,
    status: r.status,
    commentCount: r._count.comments,
  }));
}

async function viewableIdsByWhere(
  staffKey: keyof typeof SEED_STAFF,
): Promise<number[]> {
  const user = SEED_STAFF[staffKey];
  const rows = await prisma.dailyReport.findMany({
    where: viewableReportsWhere(user),
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
}

// 一覧（Prisma の where）と詳細（canViewReport）で閲覧できる日報が食い違うと、
// 「一覧には出るのに開くと 404」「一覧に出ない日報を URL で開ける」といった不具合になるため、実際の DB で突き合わせる
describe("viewableReportsWhere と canViewReport は同じ規則（テスト用DB の実データで確認）", () => {
  it.each(Object.keys(SEED_STAFF) as (keyof typeof SEED_STAFF)[])(
    "%s：where で取れる日報 = canViewReport が true の日報",
    async (staffKey) => {
      const user = SEED_STAFF[staffKey];
      const expected = (await allReports())
        .filter((r) => canViewReport(user, r))
        .map((r) => r.id);

      expect(await viewableIdsByWhere(staffKey)).toEqual(expected);
    },
  );

  it("T-RPT-21・T-RPT-22 の期待どおりの日報が取れる", async () => {
    const ids = (...keys: (keyof typeof SEED_REPORTS)[]) =>
      keys.map((k) => SEED_REPORTS[k].id).sort((a, b) => a - b);

    expect(await viewableIdsByWhere("yamada")).toEqual(
      ids("commented", "submitted", "draft"),
    );
    expect(await viewableIdsByWhere("suzuki")).toEqual(
      ids("commented", "submitted", "satoSubmitted"),
    );
    expect(await viewableIdsByWhere("admin")).toEqual([]);
  });

  it("無効化された営業の過去の日報も、上長は引き続き閲覧できる（決定事項 #16）", async () => {
    await prisma.salesStaff.update({
      where: { id: SEED_STAFF.yamada.id },
      data: { isActive: false },
    });

    expect(await viewableIdsByWhere("suzuki")).toContain(
      SEED_REPORTS.submitted.id,
    );
  });
});
