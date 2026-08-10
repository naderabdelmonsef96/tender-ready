/**
 * Deterministic catalogue/price-list row extraction from a spreadsheet-shaped
 * input. Pure functions only — no I/O, no AI, no invented values.
 */

import { cellText, normalizeText, type CellValue, type SheetInput } from "@/lib/boq-parse";

export type ParsedCatalogueRow = {
  rowIndex: number;
  sheetName: string;
  supplierCode: string | null;
  name: string;
  unit: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  incoterm: string | null;
  landingCost: number | null;
  landingCostCurrency: string | null;
  stockQuantity: number | null;
  warehouse: string | null;
  leadTimeDays: number | null;
  issue: string | null;
};

export type CatalogueParseResult = {
  rows: ParsedCatalogueRow[];
  sheetsScanned: number;
  issues: string[];
};

type ColumnField =
  | "supplierCode"
  | "name"
  | "unit"
  | "brand"
  | "category"
  | "price"
  | "currency"
  | "incoterm"
  | "landingCost"
  | "landingCostCurrency"
  | "stockQuantity"
  | "warehouse"
  | "leadTimeDays";

const HEADER_SYNONYMS: Record<ColumnField, string[]> = {
  supplierCode: ["supplier code", "item code", "part no", "part number", "code", "sku", "model"],
  name: ["product name", "description", "product", "item", "name"],
  unit: ["unit of measure", "uom", "unit"],
  brand: ["manufacturer", "brand", "make"],
  category: ["category", "family", "group", "type"],
  price: ["unit price", "list price", "selling price", "price", "rate", "amount"],
  currency: ["currency", "ccy"],
  incoterm: ["incoterm", "delivery term", "terms"],
  landingCost: ["landing cost", "landed cost", "cost landed", "cost price", "cp", "cost"],
  landingCostCurrency: ["landing currency", "landed cost currency", "cost currency"],
  stockQuantity: ["qty in stock", "available quantity", "stock qty", "stock", "on hand", "qty"],
  warehouse: ["warehouse", "store", "location"],
  leadTimeDays: ["lead time days", "lead time", "delivery days"],
};

const FIELD_ORDER: ColumnField[] = [
  "supplierCode",
  "name",
  "unit",
  "brand",
  "category",
  "price",
  "currency",
  "incoterm",
  "landingCost",
  "landingCostCurrency",
  "stockQuantity",
  "warehouse",
  "leadTimeDays",
];

/**
 * Two passes so one column can never satisfy two fields: exact header matches
 * are claimed first (so "Item code" can't also be read as "name" just because
 * it contains the substring "item"), then any still-unresolved field falls
 * back to a substring match among columns nothing else has already claimed.
 */
function detectColumns(headerRow: CellValue[]): Partial<Record<ColumnField, number>> {
  const map: Partial<Record<ColumnField, number>> = {};
  const claimed = new Set<number>();
  const texts = headerRow.map((cell) => normalizeText(cellText(cell)).toLowerCase());

  texts.forEach((text, colIndex) => {
    if (!text) return;
    for (const field of FIELD_ORDER) {
      if (map[field] !== undefined) continue;
      if (HEADER_SYNONYMS[field].includes(text)) {
        map[field] = colIndex;
        claimed.add(colIndex);
      }
    }
  });

  texts.forEach((text, colIndex) => {
    if (!text || claimed.has(colIndex)) return;
    for (const field of FIELD_ORDER) {
      if (map[field] !== undefined) continue;
      if (HEADER_SYNONYMS[field].some((synonym) => text.includes(synonym))) {
        map[field] = colIndex;
        claimed.add(colIndex);
      }
    }
  });

  return map;
}

function parsePrice(value: CellValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[,\s]/g, "")
    .replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

const MAX_HEADER_SCAN_ROWS = 10;

/** Reads product/price rows out of a workbook using header-name matching — no AI. */
export function parseCatalogueWorkbook(sheets: SheetInput[]): CatalogueParseResult {
  const rows: ParsedCatalogueRow[] = [];
  const issues: string[] = [];
  let sheetsScanned = 0;

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;

    let headerRowIndex = -1;
    let columns: Partial<Record<ColumnField, number>> = {};
    for (let r = 0; r < Math.min(sheet.rows.length, MAX_HEADER_SCAN_ROWS); r++) {
      const candidate = detectColumns(sheet.rows[r] ?? []);
      if (candidate.name !== undefined && Object.keys(candidate).length >= 2) {
        headerRowIndex = r;
        columns = candidate;
        break;
      }
    }
    if (headerRowIndex === -1) {
      issues.push(
        `Sheet "${sheet.name}": no recognisable header row (need at least a name/description column).`,
      );
      continue;
    }
    sheetsScanned += 1;

    for (let r = headerRowIndex + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const get = (field: ColumnField): CellValue =>
        columns[field] !== undefined ? row[columns[field]!] : null;

      const name = cellText(get("name")).trim();
      if (!name) continue;

      const supplierCode = cellText(get("supplierCode")).trim() || null;
      const priceRaw = get("price");
      const price = parsePrice(priceRaw);
      const unreadable = (raw: CellValue, parsed: number | null): boolean =>
        raw !== null && raw !== undefined && raw !== "" && parsed === null;
      const priceLooksUnreadable = unreadable(priceRaw, price);

      const landingRaw = get("landingCost");
      const landingCost = parsePrice(landingRaw);
      const stockRaw = get("stockQuantity");
      const stockQuantity = parsePrice(stockRaw);
      const leadRaw = get("leadTimeDays");
      const leadTimeParsed = parsePrice(leadRaw);
      const leadTimeDays = leadTimeParsed === null ? null : Math.max(0, Math.round(leadTimeParsed));

      let issue: string | null = null;
      if (!supplierCode) issue = "No supplier code found in this row.";
      else if (priceLooksUnreadable) issue = "Price could not be read as a number.";
      else if (unreadable(landingRaw, landingCost))
        issue = "Landing cost could not be read as a number.";
      else if (unreadable(stockRaw, stockQuantity))
        issue = "Stock quantity could not be read as a number.";
      else if (unreadable(leadRaw, leadTimeParsed))
        issue = "Lead time could not be read as a number.";

      rows.push({
        rowIndex: r,
        sheetName: sheet.name,
        supplierCode,
        name,
        unit: cellText(get("unit")).trim() || null,
        brand: cellText(get("brand")).trim() || null,
        category: cellText(get("category")).trim() || null,
        price,
        currency: cellText(get("currency")).trim().toUpperCase() || null,
        incoterm: cellText(get("incoterm")).trim().toUpperCase() || null,
        landingCost,
        landingCostCurrency: cellText(get("landingCostCurrency")).trim().toUpperCase() || null,
        stockQuantity: stockQuantity === null ? null : Math.max(0, stockQuantity),
        warehouse: cellText(get("warehouse")).trim() || null,
        leadTimeDays,
        issue,
      });
    }
  }

  return { rows, sheetsScanned, issues };
}
