import { describe, expect, it } from "vitest";

import { parseCatalogueWorkbook } from "@/lib/catalogue-parse";

describe("parseCatalogueWorkbook", () => {
  it("reads product rows from a header row it recognises", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Price list",
        index: 0,
        rows: [
          [
            "Item code",
            "Description",
            "Unit",
            "Brand",
            "Category",
            "Unit price",
            "Currency",
            "Incoterm",
          ],
          [
            "306R",
            "BOWA ARC 400 electrosurgical generator",
            "each",
            "BOWA",
            "Electrosurgery",
            1120,
            "EUR",
            "EXW",
          ],
          [
            "306RF-20",
            "BOWA ARC 4 bipolar forceps, 20cm",
            "each",
            "BOWA",
            "Electrosurgery",
            "236.00",
            "EUR",
            "EXW",
          ],
        ],
      },
    ]);

    expect(result.sheetsScanned).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      supplierCode: "306R",
      name: "BOWA ARC 400 electrosurgical generator",
      unit: "each",
      brand: "BOWA",
      category: "Electrosurgery",
      price: 1120,
      currency: "EUR",
      incoterm: "EXW",
      issue: null,
    });
    expect(result.rows[1]!.price).toBe(236);
  });

  it("flags rows with no supplier code instead of dropping them", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Sheet1",
        index: 0,
        rows: [
          ["Code", "Description", "Price"],
          [null, "Unlabelled spare part", 40],
        ],
      },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.supplierCode).toBeNull();
    expect(result.rows[0]!.issue).toMatch(/supplier code/i);
  });

  it("flags a price that cannot be read as a number", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Sheet1",
        index: 0,
        rows: [
          ["Code", "Description", "Price"],
          ["396R", "BOWA VIO 300", "price on request"],
        ],
      },
    ]);

    expect(result.rows[0]!.price).toBeNull();
    expect(result.rows[0]!.issue).toMatch(/price/i);
  });

  it("skips blank rows without emitting empty products", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Sheet1",
        index: 0,
        rows: [
          ["Code", "Description", "Price"],
          [null, null, null],
          ["61-1000", "Power cable", 12],
        ],
      },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.supplierCode).toBe("61-1000");
  });

  it("reports an issue and scans nothing when no header row is recognisable", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Random notes",
        index: 0,
        rows: [
          ["Not", "a", "price", "list"],
          ["just", "some", "free", "text"],
        ],
      },
    ]);

    expect(result.sheetsScanned).toBe(0);
    expect(result.rows).toHaveLength(0);
    expect(result.issues[0]).toMatch(/no recognisable header row/i);
  });
});

describe("parseCatalogueWorkbook landing cost and stock", () => {
  it("reads landing cost, stock quantity, warehouse and lead time", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Stock",
        index: 0,
        rows: [
          [
            "Item code",
            "Description",
            "UOM",
            "Unit price",
            "Currency",
            "Landed cost",
            "Cost currency",
            "Stock qty",
            "Warehouse",
            "Lead time days",
          ],
          ["A-1", "Split AC 3HP", "Each", 42000, "EGP", "31500.50", "EGP", 4, "Cairo", "7"],
          ["A-2", "Cable tray 300mm", "m", 900, "EGP", "", "", "", "", ""],
        ],
      },
    ]);

    expect(result.rows).toHaveLength(2);
    const [stocked, plain] = result.rows;
    expect(stocked?.landingCost).toBe(31500.5);
    expect(stocked?.landingCostCurrency).toBe("EGP");
    expect(stocked?.stockQuantity).toBe(4);
    expect(stocked?.warehouse).toBe("Cairo");
    expect(stocked?.leadTimeDays).toBe(7);
    expect(stocked?.issue).toBeNull();
    expect(plain?.landingCost).toBeNull();
    expect(plain?.stockQuantity).toBeNull();
    expect(plain?.warehouse).toBeNull();
  });

  it("flags a landing cost that cannot be read as a number", () => {
    const result = parseCatalogueWorkbook([
      {
        name: "Stock",
        index: 0,
        rows: [
          [["Item code"], "Description", "Landing cost"].flat(),
          ["A-1", "Split AC 3HP", "on request"],
        ],
      },
    ]);
    expect(result.rows[0]?.issue).toBe("Landing cost could not be read as a number.");
  });
});
