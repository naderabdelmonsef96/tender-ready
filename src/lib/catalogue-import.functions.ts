import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthedClient } from "@/lib/intake-db.server";
import { classifyDocument } from "@/lib/doc-ai";
import { extractCatalogueDocument } from "@/lib/catalogue-extract.server";
import {
  commitCatalogueImportRowsSchema,
  discardCatalogueImportBatchSchema,
  getCatalogueImportRowsSchema,
  listCatalogueImportBatchesSchema,
  registerCatalogueImportSchema,
  startCatalogueImportExtractionSchema,
} from "@/lib/catalogue-import-schemas";
import { parseCatalogueWorkbook } from "@/lib/catalogue-parse";
import { isSpreadsheet, readWorkbookSheets } from "@/lib/intake.server";

const BUCKET = "catalogue-files";

async function resolveCatalogueId(
  supabase: AuthedClient,
  organizationId: string,
  catalogueId: string | null | undefined,
  userId: string,
): Promise<string> {
  if (catalogueId) return catalogueId;
  const existing = await supabase
    .from("catalogues")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const created = await supabase
    .from("catalogues")
    .insert({ organization_id: organizationId, name: "Main catalogue", created_by: userId })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data.id;
}

export const registerCatalogueImportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerCatalogueImportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    if (!data.storagePath.startsWith(`${data.organizationId}/`)) {
      throw new Error("Storage path is outside this organization.");
    }

    const catalogueId = await resolveCatalogueId(
      supabase,
      data.organizationId,
      data.catalogueId,
      userId,
    );
    const kind = classifyDocument(data.originalName, data.mimeType ?? null);

    const batch = await supabase
      .from("catalogue_import_batches")
      .insert({
        organization_id: data.organizationId,
        catalogue_id: catalogueId,
        file_name: data.originalName,
        storage_path: data.storagePath,
        mime_type: data.mimeType ?? null,
        kind,
        status: "uploaded",
        uploaded_by: userId,
      })
      .select("id, kind, status")
      .single();
    if (batch.error) throw new Error(batch.error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.uploaded",
      objectType: "catalogue_import_batch",
      objectId: batch.data.id,
      isMaterial: false,
      summary: `${data.originalName} uploaded for catalogue import`,
    });

    return { importBatchId: batch.data.id, kind: batch.data.kind };
  });

export const startCatalogueImportExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startCatalogueImportExtractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const batch = await supabase
      .from("catalogue_import_batches")
      .select("id, catalogue_id, storage_path, mime_type, file_name, kind")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");
    const batchData = batch.data;

    const finish = async (patch: {
      status: string;
      status_message?: string | null;
      row_count?: number;
    }) => {
      const { data: updated, error } = await supabase
        .from("catalogue_import_batches")
        .update(patch)
        .eq("id", batchData.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    };

    await supabase
      .from("catalogue_import_batches")
      .update({ status: "parsing" })
      .eq("id", batchData.id);

    const download = await supabase.storage.from(BUCKET).download(batchData.storage_path);
    if (download.error || !download.data) {
      const updated = await finish({
        status: "failed",
        status_message: download.error?.message ?? "The stored file could not be read.",
      });
      return { batch: updated, rowCount: 0 };
    }
    const bytes = await download.data.arrayBuffer();

    type Row = {
      sheetName: string | null;
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
      rowIndex: number;
    };
    let rows: Row[];

    if (isSpreadsheet(batchData.file_name)) {
      const parsed = parseCatalogueWorkbook(readWorkbookSheets(bytes));
      rows = parsed.rows.map((row) => ({
        sheetName: row.sheetName,
        pageNumber: null,
        supplierCode: row.supplierCode,
        name: row.name,
        unit: row.unit,
        brand: row.brand,
        category: row.category,
        price: row.price,
        currency: row.currency,
        incoterm: row.incoterm,
        confidence: 1,
        issue: row.issue,
        rowIndex: row.rowIndex,
      }));
      if (rows.length === 0 && parsed.issues.length > 0) {
        const updated = await finish({ status: "failed", status_message: parsed.issues.join(" ") });
        return { batch: updated, rowCount: 0 };
      }
    } else {
      const outcome = await extractCatalogueDocument({
        fileName: batchData.file_name,
        mimeType: batchData.mime_type,
        bytes,
      });
      if (!outcome.ok) {
        const updated = await finish({ status: outcome.status, status_message: outcome.message });
        return { batch: updated, rowCount: 0 };
      }
      rows = outcome.rows.map((row) => ({
        sheetName: null,
        pageNumber: row.pageNumber,
        supplierCode: row.supplierCode,
        name: row.name,
        unit: row.unit,
        brand: row.brand,
        category: row.category,
        price: row.price,
        currency: row.currency,
        incoterm: row.incoterm,
        confidence: row.confidence,
        issue: row.issue,
        rowIndex: row.rowIndex,
      }));
    }

    // Dedupe hint: does a catalogue entry with this supplier code already exist?
    const existingProducts = await supabase
      .from("catalogue_products")
      .select("id, supplier_code")
      .eq("organization_id", data.organizationId)
      .eq("catalogue_id", batchData.catalogue_id);
    if (existingProducts.error) throw new Error(existingProducts.error.message);
    const productBySupplierCode = new Map(
      (existingProducts.data ?? []).map((product) => [product.supplier_code, product.id]),
    );

    await supabase.from("catalogue_import_rows").delete().eq("import_batch_id", batchData.id);

    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      const { error } = await supabase.from("catalogue_import_rows").insert(
        chunk.map((row) => ({
          organization_id: data.organizationId,
          import_batch_id: batchData.id,
          row_index: row.rowIndex,
          sheet_name: row.sheetName,
          page_number: row.pageNumber,
          supplier_code: row.supplierCode,
          name: row.name,
          unit: row.unit,
          brand: row.brand,
          category: row.category,
          price: row.price,
          currency: row.currency,
          incoterm: row.incoterm,
          confidence: row.confidence,
          issue: row.issue,
          status: "pending",
          matched_product_id: row.supplierCode
            ? (productBySupplierCode.get(row.supplierCode) ?? null)
            : null,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const updated = await finish({
      status: rows.length === 0 ? "partial" : "parsed",
      status_message:
        rows.length === 0 ? "No product rows could be recognised in this file." : null,
      row_count: rows.length,
    });

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.extracted",
      objectType: "catalogue_import_batch",
      objectId: batchData.id,
      isMaterial: false,
      summary: `${rows.length} row(s) extracted from ${batchData.file_name}`,
    });

    return { batch: updated, rowCount: rows.length };
  });

export const listCatalogueImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listCatalogueImportBatchesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: batches, error } = await context.supabase
      .from("catalogue_import_batches")
      .select("id, file_name, kind, status, status_message, row_count, committed_count, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { batches: batches ?? [] };
  });

export const getCatalogueImportRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getCatalogueImportRowsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [batch, rows] = await Promise.all([
      supabase
        .from("catalogue_import_batches")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("id", data.importBatchId)
        .maybeSingle(),
      supabase
        .from("catalogue_import_rows")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("import_batch_id", data.importBatchId)
        .order("row_index"),
    ]);
    if (batch.error) throw new Error(batch.error.message);
    if (rows.error) throw new Error(rows.error.message);
    if (!batch.data) throw new Error("Import batch not found");
    return { batch: batch.data, rows: rows.data ?? [] };
  });

export const commitCatalogueImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commitCatalogueImportRowsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const batch = await supabase
      .from("catalogue_import_batches")
      .select("id, catalogue_id, committed_count, file_name")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");

    const rows = await supabase
      .from("catalogue_import_rows")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("import_batch_id", data.importBatchId)
      .eq("status", "pending")
      .in("id", data.rowIds);
    if (rows.error) throw new Error(rows.error.message);

    let committed = 0;
    let skipped = 0;
    for (const row of rows.data ?? []) {
      if (!row.supplier_code || !row.name) {
        skipped += 1;
        continue;
      }
      const saved = await supabase
        .from("catalogue_products")
        .upsert(
          {
            organization_id: data.organizationId,
            catalogue_id: batch.data.catalogue_id,
            supplier_code: row.supplier_code,
            name: row.name,
            unit: row.unit,
            brand: row.brand,
            category: row.category,
            base_cost: row.price,
            currency: row.currency ?? "EGP",
            incoterm: row.incoterm,
            is_active: false,
            created_by: userId,
          },
          { onConflict: "catalogue_id,supplier_code" },
        )
        .select("id")
        .single();
      if (saved.error) throw new Error(saved.error.message);

      const update = await supabase
        .from("catalogue_import_rows")
        .update({ status: "committed", matched_product_id: saved.data.id })
        .eq("id", row.id);
      if (update.error) throw new Error(update.error.message);
      committed += 1;
    }

    await supabase
      .from("catalogue_import_batches")
      .update({ committed_count: batch.data.committed_count + committed })
      .eq("id", batch.data.id);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.committed",
      objectType: "catalogue_import_batch",
      objectId: batch.data.id,
      isMaterial: true,
      summary: `${committed} row(s) committed from ${batch.data.file_name}${skipped > 0 ? `, ${skipped} skipped (missing code or name)` : ""}`,
    });

    return { committed, skipped };
  });

export const discardCatalogueImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => discardCatalogueImportBatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const batch = await supabase
      .from("catalogue_import_batches")
      .select("id, storage_path, file_name")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");

    await supabase.storage.from(BUCKET).remove([batch.data.storage_path]);
    const { error } = await supabase
      .from("catalogue_import_batches")
      .delete()
      .eq("id", batch.data.id);
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.discarded",
      objectType: "catalogue_import_batch",
      objectId: batch.data.id,
      isMaterial: false,
      summary: `${batch.data.file_name} discarded`,
    });

    return { discarded: true };
  });
