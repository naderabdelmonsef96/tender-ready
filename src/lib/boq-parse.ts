/**
 * Deterministic BOQ / requirements extraction from a spreadsheet-shaped input.
 *
 * Pure functions only — no I/O, no AI, no invented values. Every emitted row
 * carries the sheet, row and cell it came from so provenance can be replayed.
 */

export type CellValue = string | number | boolean | null | undefined;

export type SheetInput = {
  name: string;
  index: number;
  rows: CellValue[][];
};

export type ExtractedSource = {
  sheetName: string;
  sheetIndex: number;
  rowIndex: number;
  cellRef: string;
  rawText: string;
  normalizedText: string;
  confidence: number;
};

export type ExtractedItem = {
  sheetName: string;
  sheetIndex: number;
  displayOrder: number;
  itemCode: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  rateOnly: boolean;
  sectionPath: string | null;
  criticality: "standard" | "critical";
  status: "needs_review" | "exception";
  confidence: number;
  source: ExtractedSource;
};

export type ExtractedRequirement = {
  category: string;
  text: string;
  criticality: "standard" | "critical";
  confidence: number;
  source: ExtractedSource;
};

export type ExtractedException = {
  kind:
    | "missing_header"
    | "merged_header"
    | "subtotal_row"
    | "blank_quantity"
    | "unparsable_unit"
    | "missing_source";
  message: string;
  sheetName: string;
  rowIndex: number | null;
  cellRef: string | null;
  itemKey: string | null;
};

export type SheetSummary = {
  name: string;
  index: number;
  kind: "boq" | "requirements" | "unrecognised";
  rowsScanned: number;
  itemsCreated: number;
  requirementsCreated: number;
  exceptions: number;
  note: string | null;
};

export type ExtractionResult = {
  items: ExtractedItem[];
  requirements: ExtractedRequirement[];
  exceptions: ExtractedException[];
  sheets: SheetSummary[];
  rowsScanned: number;
};

const REQUIREMENT_SHEET = /spec|note|preamble|term|scope|condition|general|compliance|مواصف|شروط/i;
const SUBTOTAL =
  /\b(sub\s*total|subtotal|total|carried\s+forward|brought\s+forward|summary)\b|الإجمالي|إجمالي/i;
const RATE_ONLY = /rate\s*only|سعر\s*فقط/i;
const CRITICAL =
  /\b(must|shall|mandatory|certif\w*|compl\w*|warrant\w*|safety|standard)\b|يجب|إلزامي/i;

const KNOWN_UNITS = new Set([
  "no",
  "nos",
  "no.",
  "pc",
  "pcs",
  "set",
  "sets",
  "item",
  "lot",
  "ls",
  "lm",
  "m",
  "m1",
  "m2",
  "m3",
  "sqm",
  "cum",
  "rm",
  "kg",
  "ton",
  "l",
  "ltr",
  "day",
  "hr",
  "month",
  "%",
  "عدد",
  "متر",
  "كجم",
]);

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function cellRef(rowIndex: number, columnIndex: number): string {
  return `${columnLetter(columnIndex)}${rowIndex + 1}`;
}

export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\u200f\u200e]/g, "")
    .trim();
}

export function parseQuantity(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value);
  if (!text) return null;
  const cleaned = text.replace(/[,\s\u066c]/g, "").replace(/\u066b/g, ".");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeUnit(value: CellValue): { unit: string | null; recognised: boolean } {
  const text = cellText(value);
  if (!text) return { unit: null, recognised: false };
  const compact = text.toLowerCase().replace(/\s+/g, "");
  const map: Record<string, string> = {
    "sq.m": "m2",
    sqm: "m2",
    "m²": "m2",
    m2: "m2",
    "cu.m": "m3",
    cum: "m3",
    "m³": "m3",
    m3: "m3",
    "l.m": "lm",
    lm: "lm",
    rm: "lm",
    "no.": "no",
    nos: "no",
    pcs: "pc",
    sets: "set",
  };
  const unit = map[compact] ?? compact;
  return { unit, recognised: KNOWN_UNITS.has(unit) };
}

type HeaderMap = {
  rowIndex: number;
  code: number | null;
  description: number | null;
  unit: number | null;
  quantity: number | null;
  rate: number | null;
};

const HEADER_PATTERNS: Array<[keyof Omit<HeaderMap, "rowIndex">, RegExp]> = [
  ["code", /^(item|item\s*no|no\.?|s\.?no|code|ref|بند|رقم)$/i],
  ["description", /(description|desc|particular|scope of work|item description|وصف|البيان)/i],
  ["unit", /^(unit|uom|units|الوحدة)$/i],
  ["quantity", /^(qty|quantity|quant|الكمية)$/i],
  ["rate", /(rate|unit price|price|السعر|الفئة)/i],
];

export function detectHeader(rows: CellValue[][]): HeaderMap | null {
  const limit = Math.min(rows.length, 40);
  for (let r = 0; r < limit; r += 1) {
    const row = rows[r] ?? [];
    const found: HeaderMap = {
      rowIndex: r,
      code: null,
      description: null,
      unit: null,
      quantity: null,
      rate: null,
    };
    let hits = 0;
    row.forEach((cell, c) => {
      const text = cellText(cell);
      if (!text) return;
      for (const [key, pattern] of HEADER_PATTERNS) {
        if (found[key] === null && pattern.test(text)) {
          found[key] = c;
          hits += 1;
          break;
        }
      }
    });
    if (found.description !== null && hits >= 2) return found;
  }
  return null;
}

function longestTextColumn(row: CellValue[]): number {
  let best = 0;
  let bestLength = -1;
  row.forEach((cell, index) => {
    const length = cellText(cell).length;
    if (length > bestLength) {
      bestLength = length;
      best = index;
    }
  });
  return best;
}

export function extractWorkbook(sheets: SheetInput[]): ExtractionResult {
  const items: ExtractedItem[] = [];
  const requirements: ExtractedRequirement[] = [];
  const exceptions: ExtractedException[] = [];
  const summaries: SheetSummary[] = [];
  let rowsScanned = 0;

  for (const sheet of sheets) {
    const before = {
      items: items.length,
      requirements: requirements.length,
      exceptions: exceptions.length,
    };
    let scanned = 0;
    let kind: SheetSummary["kind"] = "boq";
    let note: string | null = null;

    if (REQUIREMENT_SHEET.test(sheet.name)) {
      kind = "requirements";
      sheet.rows.forEach((row, rowIndex) => {
        const columnIndex = longestTextColumn(row);
        const raw = cellText(row[columnIndex]);
        scanned += 1;
        if (raw.length < 12) return;
        const normalized = normalizeText(raw);
        requirements.push({
          category: sheet.name,
          text: normalized,
          criticality: CRITICAL.test(normalized) ? "critical" : "standard",
          confidence: 0.8,
          source: {
            sheetName: sheet.name,
            sheetIndex: sheet.index,
            rowIndex,
            cellRef: cellRef(rowIndex, columnIndex),
            rawText: raw,
            normalizedText: normalized,
            confidence: 0.8,
          },
        });
      });
    } else {
      const header = detectHeader(sheet.rows);
      if (!header) {
        kind = "unrecognised";
        note = "No item/description/quantity header band was recognised in this sheet.";
        exceptions.push({
          kind: "missing_header",
          message: `Sheet "${sheet.name}" has no recognisable BOQ header row, so nothing was extracted from it.`,
          sheetName: sheet.name,
          rowIndex: null,
          cellRef: null,
          itemKey: null,
        });
        scanned = sheet.rows.length;
      } else {
        let section: string | null = null;
        let order = 0;
        for (let r = header.rowIndex + 1; r < sheet.rows.length; r += 1) {
          const row = sheet.rows[r] ?? [];
          scanned += 1;
          const descriptionIndex = header.description ?? longestTextColumn(row);
          const rawDescription = cellText(row[descriptionIndex]);
          const rawCode = header.code !== null ? cellText(row[header.code]) : "";
          const rawUnit = header.unit !== null ? row[header.unit] : null;
          const rawQuantityCell = header.quantity !== null ? row[header.quantity] : null;
          const rawQuantity = cellText(rawQuantityCell);
          const rawRate = header.rate !== null ? cellText(row[header.rate]) : "";

          const rowIsEmpty = row.every((cell) => cellText(cell) === "");
          if (rowIsEmpty) continue;

          if (!rawDescription) {
            if (rawQuantity || rawRate) {
              exceptions.push({
                kind: "missing_source",
                message: "A row carries values but no description text, so it was not imported.",
                sheetName: sheet.name,
                rowIndex: r,
                cellRef: cellRef(r, descriptionIndex),
                itemKey: null,
              });
            }
            continue;
          }

          if (SUBTOTAL.test(rawDescription)) {
            exceptions.push({
              kind: "subtotal_row",
              message: `Subtotal or summary row "${normalizeText(rawDescription)}" was excluded from the item register.`,
              sheetName: sheet.name,
              rowIndex: r,
              cellRef: cellRef(r, descriptionIndex),
              itemKey: null,
            });
            continue;
          }

          const quantity = parseQuantity(rawQuantityCell);
          const { unit, recognised } = normalizeUnit(rawUnit);
          const rateOnly = RATE_ONLY.test(rawQuantity) || RATE_ONLY.test(rawRate);
          const hasCommercialSignal = Boolean(rawQuantity || rawUnit || rawRate || rawCode);

          if (!hasCommercialSignal) {
            section = normalizeText(rawDescription);
            continue;
          }

          const isBlankQuantity = quantity === null && !rateOnly;
          let confidence = 0.95;
          if (isBlankQuantity) confidence = 0.55;
          else if (!unit) confidence = 0.7;
          else if (!recognised) confidence = 0.8;

          const normalized = normalizeText(rawDescription);
          const itemKey = `${sheet.index}:${r}`;
          order += 1;

          items.push({
            sheetName: sheet.name,
            sheetIndex: sheet.index,
            displayOrder: order,
            itemCode: rawCode || null,
            description: normalized,
            unit,
            quantity,
            rateOnly,
            sectionPath: section,
            criticality: CRITICAL.test(normalized) ? "critical" : "standard",
            status: isBlankQuantity ? "exception" : "needs_review",
            confidence,
            source: {
              sheetName: sheet.name,
              sheetIndex: sheet.index,
              rowIndex: r,
              cellRef: cellRef(r, descriptionIndex),
              rawText: rawDescription,
              normalizedText: normalized,
              confidence,
            },
          });

          if (isBlankQuantity) {
            exceptions.push({
              kind: "blank_quantity",
              message: `"${normalized}" has no readable quantity. Enter it from the source or mark it rate-only.`,
              sheetName: sheet.name,
              rowIndex: r,
              cellRef:
                header.quantity !== null
                  ? cellRef(r, header.quantity)
                  : cellRef(r, descriptionIndex),
              itemKey,
            });
          }
          if (unit && !recognised) {
            exceptions.push({
              kind: "unparsable_unit",
              message: `Unit "${unit}" on "${normalized}" is not a recognised unit of measure.`,
              sheetName: sheet.name,
              rowIndex: r,
              cellRef: header.unit !== null ? cellRef(r, header.unit) : null,
              itemKey,
            });
          }
        }
      }
    }

    rowsScanned += scanned;
    summaries.push({
      name: sheet.name,
      index: sheet.index,
      kind,
      rowsScanned: scanned,
      itemsCreated: items.length - before.items,
      requirementsCreated: requirements.length - before.requirements,
      exceptions: exceptions.length - before.exceptions,
      note,
    });
  }

  return { items, requirements, exceptions, sheets: summaries, rowsScanned };
}
