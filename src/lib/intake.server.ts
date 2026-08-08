import * as XLSX from "xlsx";

import type { CellValue, SheetInput } from "@/lib/boq-parse";

/** Worker-safe SHA-256 of an uploaded document. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Reads an XLSX/XLS/CSV buffer into plain sheet rows for the pure parser. */
export function readWorkbookSheets(bytes: ArrayBuffer): SheetInput[] {
  const workbook = XLSX.read(new Uint8Array(bytes), { type: "array", cellDates: false });
  return workbook.SheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const rows = sheet
      ? (XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          blankrows: true,
          defval: null,
        }) as CellValue[][])
      : [];
    return { name, index, rows };
  });
}

export const SPREADSHEET_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".csv"];

export function isSpreadsheet(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
