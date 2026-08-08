/**
 * Pure helpers for AI-assisted extraction of non-spreadsheet tender documents
 * (PDF, Word, images, plain text).
 *
 * No I/O here: the model response is validated and mapped onto the same
 * ExtractionResult contract the deterministic spreadsheet parser produces, so
 * every emitted row still carries page-level provenance and a confidence value.
 * Nothing is invented — missing values stay null and become exceptions.
 */

import { z } from "zod";

import {
  normalizeText,
  type ExtractedException,
  type ExtractedItem,
  type ExtractedRequirement,
  type ExtractionResult,
  type SheetSummary,
} from "@/lib/boq-parse";

export type DocumentKind = "spreadsheet" | "pdf" | "word" | "image" | "text" | "unsupported";

export function classifyDocument(fileName: string, mimeType?: string | null): DocumentKind {
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();
  const ext = (list: string[]) => list.some((e) => lower.endsWith(e));

  if (ext([".xlsx", ".xlsm", ".xls", ".csv"])) return "spreadsheet";
  if (ext([".pdf"]) || mime === "application/pdf") return "pdf";
  if (ext([".docx"])) return "word";
  if (ext([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"])) return "image";
  if (mime.startsWith("image/")) return "image";
  if (ext([".txt", ".md", ".rtf"]) || mime.startsWith("text/")) return "text";
  return "unsupported";
}

export const AI_EXTRACTION_SYSTEM_PROMPT = [
  "You are a tender document analyst for an engineering contractor.",
  "Read the supplied tender document and return ONLY strict JSON matching the schema given by the user.",
  "Hard rules:",
  "- Never invent, estimate or complete values. If a quantity, unit, code or section is not written in the document, use null.",
  "- Copy sourceText verbatim from the document (max 400 chars) for every row so a human can verify it.",
  "- priced BOQ lines go in items. Obligations, specifications, submittals, warranties, standards, commercial conditions go in requirements.",
  "- Mark criticality 'critical' when the text uses must/shall/mandatory/certification/compliance/warranty/safety wording.",
  "- confidence is 0..1 and must reflect legibility. Use <0.6 for scanned, blurred, cropped or ambiguous content.",
  "- Add a notes entry for anything unreadable, partially cut off, or a total/subtotal row you deliberately skipped.",
  "- Do not translate. Keep Arabic text in Arabic.",
].join("\n");

export const AI_EXTRACTION_USER_INSTRUCTION = [
  "Extract the tender content from the attached document.",
  "Return JSON with exactly this shape:",
  '{"documentKind":"boq|requirements|mixed|unknown",',
  '"items":[{"page":number|null,"itemCode":string|null,"description":string,"unit":string|null,"quantity":number|null,"rateOnly":boolean,"sectionPath":string|null,"sourceText":string,"confidence":number}],',
  '"requirements":[{"page":number|null,"category":string,"text":string,"criticality":"standard|critical","sourceText":string,"confidence":number}],',
  '"notes":[{"page":number|null,"kind":"unreadable|subtotal|missing_quantity|missing_source|other","message":string,"sourceText":string|null}]}',
].join("\n");

const numberish = z.union([z.number(), z.string(), z.null()]).optional();

const aiItemSchema = z.object({
  page: numberish,
  itemCode: z.string().nullable().optional(),
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: numberish,
  rateOnly: z.boolean().optional(),
  sectionPath: z.string().nullable().optional(),
  sourceText: z.string().nullable().optional(),
  confidence: numberish,
});

const aiRequirementSchema = z.object({
  page: numberish,
  category: z.string().nullable().optional(),
  text: z.string().min(1),
  criticality: z.enum(["standard", "critical"]).optional(),
  sourceText: z.string().nullable().optional(),
  confidence: numberish,
});

const aiNoteSchema = z.object({
  page: numberish,
  kind: z.string().nullable().optional(),
  message: z.string().min(1),
  sourceText: z.string().nullable().optional(),
});

export const aiDocumentSchema = z.object({
  documentKind: z.string().nullable().optional(),
  items: z.array(aiItemSchema).optional(),
  requirements: z.array(aiRequirementSchema).optional(),
  notes: z.array(aiNoteSchema).optional(),
});

export type AiDocumentPayload = z.infer<typeof aiDocumentSchema>;

/** Extracts the first JSON object from a model reply that may be fenced or prefixed. */
export function parseAiJson(content: string): AiDocumentPayload {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return JSON.");
  const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
  return aiDocumentSchema.parse(parsed);
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

function pageLabel(page: number | null): string {
  return page === null ? "Document" : `Page ${page}`;
}

const LOW_CONFIDENCE = 0.6;

/** Maps a validated model payload onto the shared ExtractionResult contract. */
export function mapAiPayload(payload: AiDocumentPayload, fileName: string): ExtractionResult {
  const items: ExtractedItem[] = [];
  const requirements: ExtractedRequirement[] = [];
  const exceptions: ExtractedException[] = [];
  const perPage = new Map<string, SheetSummary>();

  const summaryFor = (page: number | null, kind: SheetSummary["kind"]): SheetSummary => {
    const name = pageLabel(page);
    const existing = perPage.get(name);
    if (existing) {
      if (existing.kind !== kind) existing.kind = "boq";
      return existing;
    }
    const created: SheetSummary = {
      name,
      index: page ?? 0,
      kind,
      rowsScanned: 0,
      itemsCreated: 0,
      requirementsCreated: 0,
      exceptions: 0,
      note: null,
    };
    perPage.set(name, created);
    return created;
  };

  (payload.items ?? []).forEach((raw, index) => {
    const page = toNumber(raw.page);
    const summary = summaryFor(page, "boq");
    const confidence = toConfidence(raw.confidence);
    const quantity = toNumber(raw.quantity);
    const rateOnly = raw.rateOnly === true;
    const description = raw.description.trim();
    const sourceText = (raw.sourceText ?? description).slice(0, 400);
    const itemKey = `${page ?? 0}:${index}`;
    const missingQuantity = quantity === null && !rateOnly;
    const lowConfidence = confidence < LOW_CONFIDENCE;

    items.push({
      sheetName: summary.name,
      sheetIndex: summary.index,
      displayOrder: index,
      itemCode: raw.itemCode?.trim() || null,
      description,
      unit: raw.unit?.trim() || null,
      quantity,
      rateOnly,
      sectionPath: raw.sectionPath?.trim() || null,
      criticality: "standard",
      status: missingQuantity || lowConfidence ? "exception" : "needs_review",
      confidence,
      source: {
        sheetName: summary.name,
        sheetIndex: summary.index,
        rowIndex: index,
        cellRef: "",
        rawText: sourceText,
        normalizedText: normalizeText(description),
        confidence,
        pageNumber: page,
      },
    });
    summary.rowsScanned += 1;
    summary.itemsCreated += 1;

    if (missingQuantity) {
      exceptions.push({
        kind: "blank_quantity",
        message: `No quantity is written in ${fileName} for "${description.slice(0, 120)}". A reviewer must supply or confirm it.`,
        sheetName: summary.name,
        rowIndex: index,
        cellRef: null,
        itemKey,
      });
      summary.exceptions += 1;
    }
    if (lowConfidence) {
      exceptions.push({
        kind: "missing_source",
        message: `Low reading confidence (${Math.round(confidence * 100)}%) on ${summary.name} of ${fileName}. Verify against the original document before approval.`,
        sheetName: summary.name,
        rowIndex: index,
        cellRef: null,
        itemKey,
      });
      summary.exceptions += 1;
    }
  });

  (payload.requirements ?? []).forEach((raw, index) => {
    const page = toNumber(raw.page);
    const summary = summaryFor(page, "requirements");
    const confidence = toConfidence(raw.confidence);
    const text = raw.text.trim();
    requirements.push({
      category: raw.category?.trim() || "general",
      text,
      criticality: raw.criticality ?? "standard",
      confidence,
      source: {
        sheetName: summary.name,
        sheetIndex: summary.index,
        rowIndex: index,
        cellRef: "",
        rawText: (raw.sourceText ?? text).slice(0, 400),
        normalizedText: normalizeText(text),
        confidence,
        pageNumber: page,
      },
    });
    summary.rowsScanned += 1;
    summary.requirementsCreated += 1;
    if (confidence < LOW_CONFIDENCE) {
      exceptions.push({
        kind: "missing_source",
        message: `Low reading confidence (${Math.round(confidence * 100)}%) on a requirement from ${summary.name} of ${fileName}.`,
        sheetName: summary.name,
        rowIndex: index,
        cellRef: null,
        itemKey: null,
      });
      summary.exceptions += 1;
    }
  });

  (payload.notes ?? []).forEach((note, index) => {
    const page = toNumber(note.page);
    const summary = summaryFor(page, "unrecognised");
    exceptions.push({
      kind: note.kind === "subtotal" ? "subtotal_row" : "missing_source",
      message: note.message.slice(0, 500),
      sheetName: summary.name,
      rowIndex: index,
      cellRef: null,
      itemKey: null,
    });
    summary.exceptions += 1;
  });

  const sheets = Array.from(perPage.values()).sort((a, b) => a.index - b.index);
  return {
    items,
    requirements,
    exceptions,
    sheets,
    rowsScanned: items.length + requirements.length,
  };
}
