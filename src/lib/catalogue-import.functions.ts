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

/**
 * catalogue_import_batches/rows are owned by Lovable's independently-built
 * migration (JSONB raw_data/mapped_data, no catalogue_id on the batch) — see
 * the reconciliation migration note. This layer stores the structured
 * product-row shape inside mapped_data instead of dedicated columns.
 */
type MappedRowData = {
  supplierCode: string | null;
  name: string | null;
  unit: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  incoterm: string | null;
  confidence: number;
  matchedProductId: string | null;
};

type RawRowData = {
  sheetName: string | null;
  pageNumber: number | null;
};

async function resolveCatalogueId(
  supabase: AuthedClient,
  organizationId: string,
  userId: string,
): Promise<string> {
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

    const batch = await supabase
      .from("catalogue_import_batches")
      .insert({
        organization_id: data.organizationId,
        file_name: data.originalName,
        storage_path: data.storagePath,
        status: "uploaded",
        created_by: userId,
      })
      .select("id, status")
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

    return {
      importBatchId: batch.data.id,
      kind: classifyDocument(data.originalName, data.mimeType ?? null),
    };
  });

export const startCatalogueImportExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startCatalogueImportExtractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const batch = await supabase
      .from("catalogue_import_batches")
      .select("id, file_name, storage_path")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");
    const batchData = batch.data;
    if (!batchData.storage_path || !batchData.file_name) {
      throw new Error("This import batch has no stored file to read.");
    }
    const storagePath = batchData.storage_path;
    const fileName = batchData.file_name;

    const finish = async (patch: { status: string; total_rows?: number; failed_rows?: number }) => {
      const { data: updated, error } = await supabase
        .from("catalogue_import_batches")
        .update(patch)
        .eq("id", batchData.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    };

    const failWithMessage = async (status: string, message: string) => {
      await supabase.from("catalogue_import_rows").insert({
        batch_id: batchData.id,
        row_number: null,
        raw_data: null,
        mapped_data: null,
        status: "failed",
        error_message: message,
      });
      const updated = await finish({ status, total_rows: 0, failed_rows: 1 });
      return { batch: updated, rowCount: 0 };
    };

    await supabase
      .from("catalogue_import_batches")
      .update({ status: "parsing" })
      .eq("id", batchData.id);

    const download = await supabase.storage.from(BUCKET).download(storagePath);
    if (download.error || !download.data) {
      return failWithMessage(
        "failed",
        download.error?.message ?? "The stored file could not be read.",
      );
    }
    const bytes = await download.data.arrayBuffer();

    type Row = {
      raw: RawRowData;
      mapped: MappedRowData;
      rowNumber: number;
      issue: string | null;
    };
    let rows: Row[];

    if (isSpreadsheet(fileName)) {
      const parsed = parseCatalogueWorkbook(readWorkbookSheets(bytes));
      if (parsed.rows.length === 0) {
        return failWithMessage(
          "failed",
          parsed.issues.join(" ") || "No product rows could be recognised in this file.",
        );
      }
      rows = parsed.rows.map((row) => ({
        raw: { sheetName: row.sheetName, pageNumber: null },
        mapped: {
          supplierCode: row.supplierCode,
          name: row.name,
          unit: row.unit,
          brand: row.brand,
          category: row.category,
          price: row.price,
          currency: row.currency,
          incoterm: row.incoterm,
          confidence: 1,
          matchedProductId: null,
        },
        rowNumber: row.rowIndex,
        issue: row.issue,
      }));
    } else {
      const outcome = await extractCatalogueDocument({
        fileName,
        mimeType: data.mimeType ?? null,
        bytes,
      });
      if (!outcome.ok) {
        return failWithMessage(outcome.status, outcome.message);
      }
      rows = outcome.rows.map((row) => ({
        raw: { sheetName: null, pageNumber: row.pageNumber },
        mapped: {
          supplierCode: row.supplierCode,
          name: row.name,
          unit: row.unit,
          brand: row.brand,
          category: row.category,
          price: row.price,
          currency: row.currency,
          incoterm: row.incoterm,
          confidence: row.confidence,
          matchedProductId: null,
        },
        rowNumber: row.rowIndex,
        issue: row.issue,
      }));
    }

    // Dedupe hint: does a catalogue entry with this supplier code already exist?
    const catalogueId = await resolveCatalogueId(supabase, data.organizationId, userId);
    const existingProducts = await supabase
      .from("catalogue_products")
      .select("id, supplier_code")
      .eq("organization_id", data.organizationId)
      .eq("catalogue_id", catalogueId);
    if (existingProducts.error) throw new Error(existingProducts.error.message);
    const productBySupplierCode = new Map(
      (existingProducts.data ?? []).map((product) => [product.supplier_code, product.id]),
    );
    for (const row of rows) {
      if (row.mapped.supplierCode) {
        row.mapped.matchedProductId = productBySupplierCode.get(row.mapped.supplierCode) ?? null;
      }
    }

    await supabase.from("catalogue_import_rows").delete().eq("batch_id", batchData.id);

    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      const { error } = await supabase.from("catalogue_import_rows").insert(
        chunk.map((row) => ({
          batch_id: batchData.id,
          row_number: row.rowNumber,
          raw_data: row.raw as never,
          mapped_data: row.mapped as never,
          status: "pending",
          error_message: row.issue,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const updated = await finish({ status: "parsed", total_rows: rows.length, failed_rows: 0 });

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.extracted",
      objectType: "catalogue_import_batch",
      objectId: batchData.id,
      isMaterial: false,
      summary: `${rows.length} row(s) extracted from ${fileName}`,
    });

    return { batch: updated, rowCount: rows.length };
  });

export const listCatalogueImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listCatalogueImportBatchesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: batches, error } = await context.supabase
      .from("catalogue_import_batches")
      .select("id, file_name, status, total_rows, imported_rows, failed_rows, created_at")
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
    const batch = await supabase
      .from("catalogue_import_batches")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");

    const rows = await supabase
      .from("catalogue_import_rows")
      .select("*")
      .eq("batch_id", data.importBatchId)
      .order("row_number");
    if (rows.error) throw new Error(rows.error.message);

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
      .select("id, file_name, imported_rows, failed_rows")
      .eq("organization_id", data.organizationId)
      .eq("id", data.importBatchId)
      .maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    if (!batch.data) throw new Error("Import batch not found");
    const batchData = batch.data;

    const rows = await supabase
      .from("catalogue_import_rows")
      .select("*")
      .eq("batch_id", data.importBatchId)
      .eq("status", "pending")
      .in("id", data.rowIds);
    if (rows.error) throw new Error(rows.error.message);

    const catalogueId = await resolveCatalogueId(supabase, data.organizationId, userId);

    let committed = 0;
    let skipped = 0;
    for (const row of rows.data ?? []) {
      const mapped = (row.mapped_data ?? {}) as Partial<MappedRowData>;
      if (!mapped.supplierCode || !mapped.name) {
        skipped += 1;
        await supabase
          .from("catalogue_import_rows")
          .update({ status: "failed", error_message: "Missing supplier code or name." })
          .eq("id", row.id);
        continue;
      }

      const existing = await supabase
        .from("catalogue_products")
        .select("id")
        .eq("catalogue_id", catalogueId)
        .eq("supplier_code", mapped.supplierCode)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      const productRow = {
        organization_id: data.organizationId,
        catalogue_id: catalogueId,
        supplier_code: mapped.supplierCode,
        name: mapped.name,
        unit: mapped.unit ?? null,
        brand: mapped.brand ?? null,
        category: mapped.category ?? null,
        base_cost: mapped.price ?? null,
        currency: mapped.currency ?? "EGP",
        incoterm: mapped.incoterm ?? null,
        is_active: false,
        created_by: userId,
      };

      const saved = existing.data
        ? await supabase
            .from("catalogue_products")
            .update(productRow)
            .eq("id", existing.data.id)
            .select("id")
            .single()
        : await supabase.from("catalogue_products").insert(productRow).select("id").single();
      if (saved.error) throw new Error(saved.error.message);

      const updatedMapped: MappedRowData = {
        supplierCode: mapped.supplierCode,
        name: mapped.name,
        unit: mapped.unit ?? null,
        brand: mapped.brand ?? null,
        category: mapped.category ?? null,
        price: mapped.price ?? null,
        currency: mapped.currency ?? null,
        incoterm: mapped.incoterm ?? null,
        confidence: mapped.confidence ?? 1,
        matchedProductId: saved.data.id,
      };
      await supabase
        .from("catalogue_import_rows")
        .update({ status: "committed", mapped_data: updatedMapped as never })
        .eq("id", row.id);
      committed += 1;
    }

    await supabase
      .from("catalogue_import_batches")
      .update({
        imported_rows: batchData.imported_rows + committed,
        failed_rows: batchData.failed_rows + skipped,
      })
      .eq("id", batchData.id);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_import.committed",
      objectType: "catalogue_import_batch",
      objectId: batchData.id,
      isMaterial: true,
      summary: `${committed} row(s) committed from ${batchData.file_name ?? "import"}${skipped > 0 ? `, ${skipped} skipped (missing code or name)` : ""}`,
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

    if (batch.data.storage_path) {
      await supabase.storage.from(BUCKET).remove([batch.data.storage_path]);
    }
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
      summary: `${batch.data.file_name ?? "import"} discarded`,
    });

    return { discarded: true };
  });
