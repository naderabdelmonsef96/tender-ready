/**
 * Pure helpers for AI-assisted extraction of non-spreadsheet catalogue
 * documents (PDF, Word, images) — a supplier catalogue or price list.
 *
 * Mirrors the contract in doc-ai.ts but targets product rows instead of BOQ
 * items. Nothing is invented — missing values stay null.
 */

import { z } from "zod";

export const CATALOGUE_AI_SYSTEM_PROMPT = [
  "You are a precise catalogue and price-list data extractor.",
  "Read the supplied supplier catalogue or price list and return ONLY strict JSON matching the schema given by the user.",
  "Hard rules:",
  "- Never invent, estimate or complete a code, name or price. If it is not written in the document, use null.",
  "- Copy sourceText verbatim from the document (max 300 chars) for every row so a human can verify it.",
  "- confidence is 0..1 and must reflect legibility and how unambiguous the row is. Use <0.6 for scanned, blurred, cropped or ambiguous rows, or where the unit price could apply to more than one pack size.",
  "- Do not translate. Keep Arabic text in Arabic.",
].join("\n");

export const CATALOGUE_AI_USER_INSTRUCTION = [
  "Extract every product/price row from the attached catalogue or price list.",
  "Return JSON with exactly this shape:",
  '{"rows":[{"page":number|null,"supplierCode":string|null,"name":string,"unit":string|null,"brand":string|null,"category":string|null,"price":number|null,"currency":string|null,"incoterm":string|null,"sourceText":string,"confidence":number}]}',
].join("\n");

const numberish = z.union([z.number(), z.string(), z.null()]).optional();

const catalogueAiRowSchema = z.object({
  page: numberish,
  supplierCode: z.string().nullable().optional(),
  name: z.string().min(1),
  unit: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  price: numberish,
  currency: z.string().nullable().optional(),
  incoterm: z.string().nullable().optional(),
  sourceText: z.string().nullable().optional(),
  confidence: numberish,
});

export const catalogueAiDocumentSchema = z.object({
  rows: z.array(catalogueAiRowSchema).optional(),
});

export type CatalogueAiDocumentPayload = z.infer<typeof catalogueAiDocumentSchema>;

/** Extracts the first JSON object from a model reply that may be fenced or prefixed. */
export function parseCatalogueAiJson(content: string): CatalogueAiDocumentPayload {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return JSON.");
  const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
  return catalogueAiDocumentSchema.parse(parsed);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s]/g, "");
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toConfidence(value: unknown): number {
  const n = toNumber(value);
  if (n === null) return 0.5;
  const scaled = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, Number(scaled.toFixed(2))));
}

export type MappedCatalogueAiRow = {
  rowIndex: number;
  pageNumber: number | null;
  supplierCode: string | null;
  name: string;
  unit: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  incoterm: string | null;
  confidence: number;
  issue: string | null;
};

/** Maps a validated model payload onto plain catalogue import rows. */
export function mapCatalogueAiPayload(payload: CatalogueAiDocumentPayload): MappedCatalogueAiRow[] {
  return (payload.rows ?? []).map((raw, index) => {
    const confidence = toConfidence(raw.confidence);
    const price = toNumber(raw.price);
    const supplierCode = raw.supplierCode?.trim() || null;
    let issue: string | null = null;
    if (!supplierCode) issue = "No supplier code was found for this row.";
    else if (confidence < 0.6)
      issue = "Low reading confidence — verify against the original document.";

    return {
      rowIndex: index,
      pageNumber: toNumber(raw.page),
      supplierCode,
      name: raw.name.trim(),
      unit: raw.unit?.trim() || null,
      brand: raw.brand?.trim() || null,
      category: raw.category?.trim() || null,
      price,
      currency: raw.currency?.trim().toUpperCase() || null,
      incoterm: raw.incoterm?.trim().toUpperCase() || null,
      confidence,
      issue,
    };
  });
}
