import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/auth-redirect";

describe("safeNext", () => {
  it("keeps same-origin absolute paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/settings/users?tab=roles")).toBe("/settings/users?tab=roles");
  });

  it("rejects cross-origin and protocol-relative targets", () => {
    expect(safeNext("https://evil.example/x")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("rejects non-string input", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(42)).toBe("/");
  });
});
