import { describe, expect, it } from "vitest";

import { classifyDocument, mapAiPayload, parseAiJson } from "@/lib/doc-ai";

describe("classifyDocument", () => {
  it("routes real tender formats to a reader", () => {
    expect(classifyDocument("boq.xlsx", null)).toBe("spreadsheet");
    expect(classifyDocument("tender.PDF", null)).toBe("pdf");
    expect(classifyDocument("scope.docx", null)).toBe("word");
    expect(classifyDocument("scan.jpeg", null)).toBe("image");
    expect(classifyDocument("photo", "image/heic")).toBe("image");
    expect(classifyDocument("notes.txt", null)).toBe("text");
    expect(classifyDocument("archive.zip", "application/zip")).toBe("unsupported");
  });
});

describe("parseAiJson", () => {
  it("reads fenced JSON replies", () => {
    const payload = parseAiJson('```json\n{"items":[],"requirements":[]}\n```');
    expect(payload.items).toEqual([]);
  });

  it("rejects non-JSON replies", () => {
    expect(() => parseAiJson("I cannot read this")).toThrow();
  });
});

describe("mapAiPayload", () => {
  it("keeps provenance and never invents quantities", () => {
    const result = mapAiPayload(
      {
        items: [
          {
            page: 3,
            itemCode: "2.1",
            description: "Supply and install FCU",
            unit: "no",
            quantity: "12",
            sourceText: "2.1 Supply and install FCU  no  12",
            confidence: 0.92,
          },
          {
            page: 3,
            description: "Blurred line",
            quantity: null,
            confidence: 0.3,
          },
        ],
        requirements: [
          {
            page: 1,
            category: "compliance",
            text: "Contractor shall submit ISO 9001 certificate",
            criticality: "critical",
            confidence: 0.9,
          },
        ],
        notes: [{ page: 4, kind: "subtotal", message: "Skipped a page subtotal row" }],
      },
      "tender.pdf",
    );

    expect(result.items).toHaveLength(2);
    const [first, second] = result.items;
    expect(first?.quantity).toBe(12);
    expect(first?.status).toBe("needs_review");
    expect(first?.source.pageNumber).toBe(3);
    expect(first?.source.rawText).toContain("Supply and install FCU");
    expect(second?.quantity).toBeNull();
    expect(second?.status).toBe("exception");

    expect(result.requirements[0]?.criticality).toBe("critical");
    expect(result.exceptions.some((e) => e.kind === "blank_quantity")).toBe(true);
    expect(result.exceptions.some((e) => e.kind === "subtotal_row")).toBe(true);
    expect(result.rowsScanned).toBe(3);
    expect(result.sheets.map((s) => s.name)).toContain("Page 3");
  });

  it("normalises percentage confidences", () => {
    const result = mapAiPayload(
      { items: [{ page: null, description: "Item", quantity: 1, confidence: 85 }] },
      "scan.png",
    );
    expect(result.items[0]?.confidence).toBe(0.85);
    expect(result.items[0]?.sheetName).toBe("Document");
  });
});
