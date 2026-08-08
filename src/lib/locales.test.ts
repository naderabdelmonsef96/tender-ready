import { describe, expect, it } from "vitest";

import { ar, en } from "@/lib/locales";

type Tree = { [key: string]: string | Tree };

function paths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : paths(value, path);
  });
}

describe("locale bundles", () => {
  const enPaths = paths(en as unknown as Tree).sort();
  const arPaths = paths(ar as unknown as Tree).sort();

  it("expose the same keys in English and Arabic", () => {
    expect(arPaths).toEqual(enPaths);
  });

  it("have no empty strings", () => {
    for (const bundle of [en, ar] as unknown as Tree[]) {
      for (const path of paths(bundle)) {
        const value = path.split(".").reduce<string | Tree>((node, key) => {
          return (node as Tree)[key] as string | Tree;
        }, bundle);
        expect(String(value).trim().length, path).toBeGreaterThan(0);
      }
    }
  });

  it("keep every enum-backed label translated", () => {
    const stages = ["intake", "technical", "product", "sourcing", "commercial", "finance", "release"];
    const states = [
      "draft",
      "submitted",
      "in_review",
      "changes_requested",
      "approved",
      "rejected",
      "superseded",
      "released",
    ];
    const roles = [
      "org_admin",
      "proposal_engineer",
      "technical_lead",
      "product_manager",
      "sourcing_manager",
      "commercial_manager",
      "finance_manager",
      "signatory",
      "viewer",
    ];
    for (const key of stages) expect(ar.stage[key as keyof typeof ar.stage]).toBeTruthy();
    for (const key of states) expect(ar.decision[key as keyof typeof ar.decision]).toBeTruthy();
    for (const key of roles) expect(ar.roles[key as keyof typeof ar.roles]).toBeTruthy();
  });
});
