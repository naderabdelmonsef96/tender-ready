import { describe, expect, it } from "vitest";

import {
  canonicalUnit,
  extractMeasures,
  rankCandidates,
  scoreProduct,
  tokenize,
  type MatchProduct,
} from "@/lib/match-engine";

const pump: MatchProduct = {
  id: "p1",
  code: "TR-PMP-050",
  name: "Centrifugal water pump 5 HP",
  nameAr: "مضخة مياه طاردة مركزية 5 حصان",
  unit: "no",
  brand: "Grundfos",
  category: "pumps",
  specs: [{ key: "power", value: "5", unit: "hp" }],
  stockQuantity: 4,
  leadTimeDays: 0,
};

const pipe: MatchProduct = {
  id: "p2",
  code: "TR-PIP-100",
  name: "Galvanised steel pipe 100 mm",
  nameAr: null,
  unit: "m",
  brand: "Ezz Steel",
  category: "piping",
  specs: [{ key: "diameter", value: "100", unit: "mm" }],
  stockQuantity: 1200,
  leadTimeDays: 0,
};

describe("unit canonicalisation", () => {
  it("folds aliases into one family", () => {
    expect(canonicalUnit("Pcs")).toBe("no");
    expect(canonicalUnit("EA")).toBe("no");
    expect(canonicalUnit("L.M")).toBe("m");
    expect(canonicalUnit("m²")).toBe("m2");
    expect(canonicalUnit(null)).toBeNull();
  });
});

describe("tokenize", () => {
  it("drops boilerplate and keeps Arabic terms", () => {
    expect(tokenize("Supply and install centrifugal pump")).toEqual(["centrifugal", "pump"]);
    expect(tokenize("توريد وتركيب مضخة مياه")).toEqual(["مضخة", "مياه"]);
  });
});

describe("extractMeasures", () => {
  it("reads measurements written in free text", () => {
    expect(extractMeasures("GI pipe 100 mm dia")).toEqual([{ value: 100, unit: "mm" }]);
    expect(extractMeasures("AHU 10,000 CFM")).toEqual([{ value: 10000, unit: "cfm" }]);
    expect(extractMeasures("no numbers here")).toEqual([]);
  });
});

describe("hard gates", () => {
  it("excludes a product whose unit family differs", () => {
    expect(scoreProduct({ description: "Galvanised steel pipe", unit: "no", sectionPath: null }, pipe)).toBeNull();
  });

  it("excludes a product whose stated specification contradicts the item", () => {
    expect(
      scoreProduct({ description: "Galvanised steel pipe 150 mm", unit: "m", sectionPath: null }, pipe),
    ).toBeNull();
  });

  it("keeps a product when the specification agrees", () => {
    const candidate = scoreProduct(
      { description: "Galvanised steel pipe 100 mm", unit: "m", sectionPath: null },
      pipe,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.matchedOn).toContain("spec:diameter");
    expect(candidate?.matchedOn).toContain("unit");
  });
});

describe("rankCandidates", () => {
  it("orders by score and never auto-confirms", () => {
    const ranked = rankCandidates(
      { description: "Supply and install centrifugal water pump 5 HP Grundfos", unit: "no", sectionPath: null },
      [pump, pipe],
    );
    expect(ranked[0]?.productId).toBe("p1");
    expect(ranked.every((candidate) => candidate.score <= 1)).toBe(true);
    expect(ranked).not.toHaveProperty("confirmed");
  });

  it("returns nothing when no product is close enough", () => {
    expect(
      rankCandidates({ description: "Site mobilisation and temporary fencing", unit: "lot", sectionPath: null }, [
        pump,
        pipe,
      ]),
    ).toEqual([]);
  });

  it("is deterministic across repeated runs", () => {
    const item = { description: "Galvanised steel pipe 100 mm", unit: "m", sectionPath: null };
    expect(rankCandidates(item, [pump, pipe])).toEqual(rankCandidates(item, [pipe, pump]));
  });
});
