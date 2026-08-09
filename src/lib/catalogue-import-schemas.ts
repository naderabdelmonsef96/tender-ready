import { z } from "zod";

export const registerCatalogueImportSchema = z.object({
  organizationId: z.string().uuid(),
  catalogueId: z.string().uuid().optional().nullable(),
  storagePath: z.string().trim().min(3).max(500),
  originalName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().max(200).optional().nullable(),
  byteSize: z.number().int().nonnegative(),
});

export const startCatalogueImportExtractionSchema = z.object({
  organizationId: z.string().uuid(),
  importBatchId: z.string().uuid(),
});

export const listCatalogueImportBatchesSchema = z.object({
  organizationId: z.string().uuid(),
});

export const getCatalogueImportRowsSchema = z.object({
  organizationId: z.string().uuid(),
  importBatchId: z.string().uuid(),
});

export const commitCatalogueImportRowsSchema = z.object({
  organizationId: z.string().uuid(),
  importBatchId: z.string().uuid(),
  rowIds: z.array(z.string().uuid()).min(1).max(2000),
});

export const discardCatalogueImportBatchSchema = z.object({
  organizationId: z.string().uuid(),
  importBatchId: z.string().uuid(),
});
