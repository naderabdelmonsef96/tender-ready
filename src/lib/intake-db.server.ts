import type { SupabaseClient } from "@supabase/supabase-js";

import { extractWorkbook, type ExtractionResult } from "@/lib/boq-parse";
import { extractDocument } from "@/lib/doc-extract.server";

import { isSpreadsheet, readWorkbookSheets } from "@/lib/intake.server";
import type { Database } from "@/integrations/supabase/types";

export type AuthedClient = SupabaseClient<Database>;

export async function writeAudit(
  supabase: AuthedClient,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    objectType: string;
    objectId?: string | null;
    objectVersion?: number | null;
    isMaterial?: boolean;
    summary?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_id: input.actorId,
    action: input.action,
    object_type: input.objectType,
    object_id: input.objectId ?? null,
    object_version: input.objectVersion ?? null,
    is_material: input.isMaterial ?? false,
    summary: input.summary ?? null,
    metadata: (input.metadata ?? {}) as never,
  });
}

/** Invalidates approvals for stages after `fromStage` when upstream evidence changes. */
export async function invalidateDownstream(
  supabase: AuthedClient,
  input: { organizationId: string; tenderId: string; reason: string },
): Promise<number> {
  const { data } = await supabase
    .from("approval_tasks")
    .update({ state: "superseded", invalidated_reason: input.reason })
    .eq("organization_id", input.organizationId)
    .eq("tender_id", input.tenderId)
    .in("state", ["submitted", "in_review", "changes_requested"])
    .select("id");
  return data?.length ?? 0;
}

type JobRow = Database["public"]["Tables"]["extraction_jobs"]["Row"];

export async function runExtraction(
  supabase: AuthedClient,
  job: JobRow,
  version: { id: string; storage_path: string; mime_type: string | null; file_name: string },
): Promise<JobRow> {
  const finish = async (patch: Partial<JobRow>): Promise<JobRow> => {
    const { data, error } = await supabase
      .from("extraction_jobs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  };

  await supabase
    .from("extraction_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);

  const download = await supabase.storage.from("tender-files").download(version.storage_path);
  if (download.error || !download.data) {
    return finish({
      status: "failed",
      error_summary: download.error?.message ?? "The stored file could not be read.",
    });
  }
  const bytes = await download.data.arrayBuffer();

  let result: ExtractionResult;
  if (isSpreadsheet(version.file_name)) {
    try {
      result = extractWorkbook(readWorkbookSheets(bytes));
    } catch (error) {
      return finish({
        status: "failed",
        error_summary: error instanceof Error ? error.message : "The workbook could not be parsed.",
      });
    }
  } else {
    const outcome = await extractDocument({
      fileName: version.file_name,
      mimeType: version.mime_type,
      bytes,
    });
    if (!outcome.ok) return finish({ status: outcome.status, error_summary: outcome.message });
    result = outcome.result;
  }

  // Replace anything previously extracted from this document version.
  await supabase.from("boq_items").delete().eq("document_version_id", version.id);
  await supabase.from("requirements").delete().eq("document_version_id", version.id);
  await supabase.from("extraction_exceptions").delete().eq("document_version_id", version.id);
  await supabase.from("source_references").delete().eq("document_version_id", version.id);

  const sources = [
    ...result.items.map((item) => item.source),
    ...result.requirements.map((req) => req.source),
  ];

  const insertedRefs: string[] = [];
  for (let offset = 0; offset < sources.length; offset += 500) {
    const chunk = sources.slice(offset, offset + 500);
    const { data, error } = await supabase
      .from("source_references")
      .insert(
        chunk.map((source) => ({
          organization_id: job.organization_id,
          tender_id: job.tender_id,
          document_version_id: version.id,
          sheet_name: source.sheetName,
          sheet_index: source.sheetIndex,
          row_index: source.rowIndex,
          cell_ref: source.cellRef,
          page_number: source.pageNumber ?? null,

          raw_text: source.rawText,
          normalized_text: source.normalizedText,
          confidence: source.confidence,
        })),
      )
      .select("id");
    if (error) return finish({ status: "failed", error_summary: error.message });
    insertedRefs.push(...(data ?? []).map((row) => row.id));
  }

  const itemRefIds = insertedRefs.slice(0, result.items.length);
  const requirementRefIds = insertedRefs.slice(result.items.length);

  const itemIdByKey = new Map<string, string>();
  for (let offset = 0; offset < result.items.length; offset += 500) {
    const chunk = result.items.slice(offset, offset + 500);
    const { data, error } = await supabase
      .from("boq_items")
      .insert(
        chunk.map((item, i) => ({
          organization_id: job.organization_id,
          tender_id: job.tender_id,
          document_version_id: version.id,
          source_reference_id: itemRefIds[offset + i] ?? null,
          sheet_name: item.sheetName,
          sheet_index: item.sheetIndex,
          display_order: item.displayOrder,
          item_code: item.itemCode,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          rate_only: item.rateOnly,
          section_path: item.sectionPath,
          criticality: item.criticality,
          status: item.status,
          confidence: item.confidence,
          created_by: job.created_by,
        })),
      )
      .select("id, sheet_index, source_reference_id");
    if (error) return finish({ status: "failed", error_summary: error.message });
    (data ?? []).forEach((row, i) => {
      const item = chunk[i];
      if (item) itemIdByKey.set(`${item.sheetIndex}:${item.source.rowIndex}`, row.id);
    });
  }

  for (let offset = 0; offset < result.requirements.length; offset += 500) {
    const chunk = result.requirements.slice(offset, offset + 500);
    const { error } = await supabase.from("requirements").insert(
      chunk.map((req, i) => ({
        organization_id: job.organization_id,
        tender_id: job.tender_id,
        document_version_id: version.id,
        source_reference_id: requirementRefIds[offset + i] ?? null,
        category: req.category,
        text: req.text,
        criticality: req.criticality,
        confidence: req.confidence,
        created_by: job.created_by,
      })),
    );
    if (error) return finish({ status: "failed", error_summary: error.message });
  }

  if (result.exceptions.length > 0) {
    const { error } = await supabase.from("extraction_exceptions").insert(
      result.exceptions.map((exception) => ({
        organization_id: job.organization_id,
        tender_id: job.tender_id,
        document_version_id: version.id,
        boq_item_id: exception.itemKey ? (itemIdByKey.get(exception.itemKey) ?? null) : null,
        kind: exception.kind,
        message: exception.message,
        sheet_name: exception.sheetName,
        row_index: exception.rowIndex,
        cell_ref: exception.cellRef,
      })),
    );
    if (error) return finish({ status: "failed", error_summary: error.message });
  }

  const partial = result.sheets.some((sheet) => sheet.kind === "unrecognised");
  return finish({
    status:
      result.items.length === 0 && result.requirements.length === 0
        ? "partial"
        : partial
          ? "partial"
          : "complete",
    sheets_found: result.sheets.length,
    rows_scanned: result.rowsScanned,
    items_created: result.items.length,
    requirements_created: result.requirements.length,
    exceptions_created: result.exceptions.length,
    sheet_summary: result.sheets as never,
    error_summary: partial
      ? "Some sheets had no recognisable BOQ header and were skipped. Review the exceptions list."
      : null,
  });
}
