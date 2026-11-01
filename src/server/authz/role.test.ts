import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/server/api/errors";

import { hasRole, requireRole } from "./role";

const admin = { id: 6, role: "ADMIN" } as const;
const sales = { id: 2, role: "SALES" } as const;

describe("requireRole", () => {
  it("指定したロールのどれかなら何も投げない", () => {
    expect(() => requireRole(admin, "ADMIN")).not.toThrow();
    expect(() => requireRole(sales, "SALES", "MANAGER")).not.toThrow();
  });

  it("どれにも当てはまらなければ 403（例：管理者の日報作成。T-RPT-16）", () => {
    expect(() => requireRole(admin, "SALES", "MANAGER")).toThrow(
      ForbiddenError,
    );
    expect(() => requireRole(sales, "ADMIN")).toThrow(ForbiddenError);
  });
});

describe("hasRole", () => {
  it("指定したロールのどれかなら true、それ以外は false", () => {
    expect(hasRole(admin, "ADMIN")).toBe(true);
    expect(hasRole(sales, "MANAGER", "ADMIN")).toBe(false);
  });
});
