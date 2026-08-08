import { describe, expect, it } from "vitest";

import { daysUntil, formatDate, formatMoney, initialsOf, toDecimal } from "@/lib/format";

describe("toDecimal", () => {
  it("parses numeric strings exactly, without float drift", () => {
    expect(toDecimal("0.1")!.plus(toDecimal("0.2")!).toString()).toBe("0.3");
    expect(toDecimal("1234567890123.4567")!.toFixed(4)).toBe("1234567890123.4567");
  });

  it("returns null for empty or invalid values", () => {
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal("")).toBeNull();
    expect(toDecimal("not-a-number")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats EGP for both languages and never renders NaN", () => {
    expect(formatMoney("18500000.5", "EGP", "en")).toMatch(/18,500,000\.50/);
    expect(formatMoney("18500000.5", "EGP", "ar")).toContain("١٨");
    expect(formatMoney(null, "EGP", "en")).toBe("—");
    expect(formatMoney("oops", "EGP", "en")).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats ISO timestamps and guards bad input", () => {
    expect(formatDate("2026-03-15T00:00:00.000Z", "en")).toMatch(/2026/);
    expect(formatDate("nope", "en")).toBe("—");
    expect(formatDate(null, "ar")).toBe("—");
  });
});

describe("daysUntil", () => {
  it("returns positive days for future dates and negative for past", () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(daysUntil(future)).toBeGreaterThan(0);
    expect(daysUntil(past)).toBeLessThan(0);
    expect(daysUntil(null)).toBeNull();
  });
});

describe("initialsOf", () => {
  it("uses up to two name parts and falls back", () => {
    expect(initialsOf("Mona Hassan Ali", "x@y.z")).toBe("MH");
    expect(initialsOf(null, "omar@example.com")).toBe("O");
  });
});
