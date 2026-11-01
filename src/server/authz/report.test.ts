import { describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError } from "@/server/api/errors";

import {
  type AuthzReport,
  type AuthzUser,
  type ReportAction,
  canComment,
  canDeleteReport,
  canEditReport,
  canPerform,
  canViewReport,
  reportPermissions,
  requireReportAccess,
  viewableReportsWhere,
} from "./report";

// テストデータ（docs/test-spec.md §2.2）と同じ関係：山田（営業）の上長は鈴木。田中は別チームの上長、佐藤は山田の同僚
const AUTHOR: AuthzUser = { id: 2, role: "SALES" }; // 山田（日報を書いた本人）
const MANAGER: AuthzUser = { id: 1, role: "MANAGER" }; // 鈴木（直属の上長）
const OTHER_MANAGER: AuthzUser = { id: 4, role: "MANAGER" }; // 田中（他チームの上長）
const COLLEAGUE: AuthzUser = { id: 3, role: "SALES" }; // 佐藤（同僚）
const ADMIN: AuthzUser = { id: 6, role: "ADMIN" }; // 管理者

const report = (
  status: AuthzReport["status"],
  commentCount: number,
): AuthzReport => ({
  salesStaffId: AUTHOR.id,
  authorManagerId: MANAGER.id,
  status,
  commentCount,
});

const DRAFT = report("DRAFT", 0);
const SUBMITTED = report("SUBMITTED", 0);
const COMMENTED = report("SUBMITTED", 1);

type Expected = {
  view: boolean;
  edit: boolean;
  delete: boolean;
  comment: boolean;
};
const NONE: Expected = {
  view: false,
  edit: false,
  delete: false,
  comment: false,
};

/**
 * U-01〜U-03：立場 × 日報の状態の全組み合わせと、期待する判定（docs/api.md §4・§5）
 */
const MATRIX: [string, AuthzUser, string, AuthzReport, Expected][] = [
  // 本人：常に閲覧可。編集は下書きか、提出済みでコメント 0 件。削除は下書きだけ。コメントは不可
  [
    "本人",
    AUTHOR,
    "下書き",
    DRAFT,
    { view: true, edit: true, delete: true, comment: false },
  ],
  [
    "本人",
    AUTHOR,
    "提出済み（コメントなし）",
    SUBMITTED,
    { view: true, edit: true, delete: false, comment: false },
  ],
  [
    "本人",
    AUTHOR,
    "提出済み（コメントあり）",
    COMMENTED,
    { view: true, edit: false, delete: false, comment: false },
  ],
  // 直属の上長：提出済みだけ閲覧・コメント可。下書きは見えない。編集・削除は不可
  ["直属の上長", MANAGER, "下書き", DRAFT, NONE],
  [
    "直属の上長",
    MANAGER,
    "提出済み（コメントなし）",
    SUBMITTED,
    { view: true, edit: false, delete: false, comment: true },
  ],
  [
    "直属の上長",
    MANAGER,
    "提出済み（コメントあり）",
    COMMENTED,
    { view: true, edit: false, delete: false, comment: true },
  ],
  // 他チームの上長・同僚・管理者：何もできない
  ["他チームの上長", OTHER_MANAGER, "下書き", DRAFT, NONE],
  [
    "他チームの上長",
    OTHER_MANAGER,
    "提出済み（コメントなし）",
    SUBMITTED,
    NONE,
  ],
  [
    "他チームの上長",
    OTHER_MANAGER,
    "提出済み（コメントあり）",
    COMMENTED,
    NONE,
  ],
  ["同僚", COLLEAGUE, "下書き", DRAFT, NONE],
  ["同僚", COLLEAGUE, "提出済み（コメントなし）", SUBMITTED, NONE],
  ["同僚", COLLEAGUE, "提出済み（コメントあり）", COMMENTED, NONE],
  ["管理者", ADMIN, "下書き", DRAFT, NONE],
  ["管理者", ADMIN, "提出済み（コメントなし）", SUBMITTED, NONE],
  ["管理者", ADMIN, "提出済み（コメントあり）", COMMENTED, NONE],
];

describe.each(MATRIX)("%s × %s", (_who, user, _state, target, expected) => {
  it(`U-01 閲覧：${expected.view ? "可" : "不可"}`, () => {
    expect(canViewReport(user, target)).toBe(expected.view);
  });

  it(`U-02 編集：${expected.edit ? "可" : "不可"}／削除：${expected.delete ? "可" : "不可"}`, () => {
    expect(canEditReport(user, target)).toBe(expected.edit);
    expect(canDeleteReport(user, target)).toBe(expected.delete);
  });

  it(`U-03 コメント：${expected.comment ? "可" : "不可"}`, () => {
    expect(canComment(user, target)).toBe(expected.comment);
  });

  it("canPerform・reportPermissions も同じ判定を返す", () => {
    for (const action of ["view", "edit", "delete", "comment"] as const) {
      expect(canPerform(user, target, action)).toBe(expected[action]);
    }
    expect(reportPermissions(user, target)).toEqual({
      canEdit: expected.edit,
      canDelete: expected.delete,
      canComment: expected.comment,
    });
  });
});

describe("立場の判定の細かい規則", () => {
  it("部下の部下の日報は見られない（直属の上長だけ。決定事項 #1）", () => {
    // 鈴木の上長が田中だったとしても、田中から山田（鈴木の部下）の日報は見えない
    expect(canViewReport(OTHER_MANAGER, SUBMITTED)).toBe(false);
  });

  it("上長のロールでない人は、manager_id が自分でも上長として扱わない（ロール変更後にデータが残った場合の防御）", () => {
    const formerManager: AuthzUser = { id: MANAGER.id, role: "SALES" };

    expect(canViewReport(formerManager, SUBMITTED)).toBe(false);
    expect(canComment(formerManager, SUBMITTED)).toBe(false);
  });

  it("上長も自分の日報は本人として扱う（上長も日報を書く）", () => {
    const own: AuthzReport = {
      salesStaffId: MANAGER.id,
      authorManagerId: null,
      status: "DRAFT",
      commentCount: 0,
    };

    expect(reportPermissions(MANAGER, own)).toEqual({
      canEdit: true,
      canDelete: true,
      canComment: false,
    });
    expect(canViewReport(MANAGER, own)).toBe(true);
  });

  it("上長がいない営業の日報は、本人以外は見られない", () => {
    const noManager: AuthzReport = { ...SUBMITTED, authorManagerId: null };

    expect(canViewReport(MANAGER, noManager)).toBe(false);
  });
});

describe("requireReportAccess（404 と 403 の使い分け。docs/api.md §1.5）", () => {
  const run =
    (user: AuthzUser, target: AuthzReport | null, action: ReportAction) => () =>
      requireReportAccess(user, target, action);

  it("日報がなければ 404", () => {
    expect(run(AUTHOR, null, "view")).toThrow(NotFoundError);
  });

  it("閲覧できない日報は、どの操作でも 404（存在を推測させない）", () => {
    for (const action of ["view", "edit", "delete", "comment"] as const) {
      expect(run(COLLEAGUE, SUBMITTED, action)).toThrow(NotFoundError);
      expect(run(MANAGER, DRAFT, action)).toThrow(NotFoundError);
    }
  });

  it("閲覧はできるが、その操作はできなければ 403", () => {
    expect(run(MANAGER, SUBMITTED, "edit")).toThrow(ForbiddenError); // T-RPT-64
    expect(run(MANAGER, SUBMITTED, "delete")).toThrow(ForbiddenError); // T-RPT-83
    expect(run(AUTHOR, SUBMITTED, "comment")).toThrow(ForbiddenError); // T-CMT-05
    expect(run(AUTHOR, SUBMITTED, "delete")).toThrow(ForbiddenError);
  });

  it("許されていれば何も投げない", () => {
    expect(run(AUTHOR, DRAFT, "delete")).not.toThrow();
    expect(run(MANAGER, SUBMITTED, "comment")).not.toThrow();
  });
});

describe("viewableReportsWhere", () => {
  it("営業は自分の日報だけ", () => {
    expect(viewableReportsWhere(AUTHOR)).toEqual({ salesStaffId: AUTHOR.id });
  });

  it("上長は自分の日報と、直属の部下の提出済みの日報", () => {
    expect(viewableReportsWhere(MANAGER)).toEqual({
      OR: [
        { salesStaffId: MANAGER.id },
        { status: "SUBMITTED", salesStaff: { managerId: MANAGER.id } },
      ],
    });
  });

  it("管理者は何にも一致しない条件", () => {
    expect(viewableReportsWhere(ADMIN)).toEqual({ id: { in: [] } });
  });
});
