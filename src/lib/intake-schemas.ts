import { z } from "zod";

export const orgTenderSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
});

export const createTenderSchema = z.object({
  organizationId: z.string().uuid(),
  reference: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3).max(300),
  titleAr: z.string().trim().max(300).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  newClientName: z.string().trim().min(2).max(200).optional().nullable(),
  projectLocation: z.string().trim().max(200).optional().nullable(),
  submissionDeadline: z.string().trim().max(40).optional().nullable(),
  currency: z.string().trim().min(3).max(3),
  estimatedValue: z.number().nonnegative().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const registerFileSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  storagePath: z.string().trim().min(3).max(500),
  originalName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().max(200).optional().nullable(),
  byteSize: z.number().int().nonnegative(),
  replaceFileId: z.string().uuid().optional().nullable(),
  replaceReason: z.string().trim().max(500).optional().nullable(),
});

export const signedUrlSchema = z.object({
  organizationId: z.string().uuid(),
  storagePath: z.string().trim().min(3).max(500),
});

export const deleteDocumentVersionSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
});

export const startExtractionSchema = z.object({
  organizationId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const updateItemSchema = z.object({
  organizationId: z.string().uuid(),
  itemId: z.string().uuid(),
  version: z.number().int().positive(),
  description: z.string().trim().min(2).max(2000).optional(),
  descriptionAr: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().max(40).optional().nullable(),
  quantity: z.number().optional().nullable(),
  rateOnly: z.boolean().optional(),
  sectionPath: z.string().trim().max(300).optional().nullable(),
  criticality: z.enum(["standard", "critical"]).optional(),
  status: z.enum(["needs_review", "reviewed", "exception", "excluded"]).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  exclusionReason: z.string().trim().max(500).optional().nullable(),
  overrideReason: z.string().trim().max(500).optional().nullable(),
});

export const deleteBoqItemSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const bulkItemsSchema = z.object({
  organizationId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["mark_reviewed", "reclassify_section", "exclude"]),
  sectionPath: z.string().trim().max(300).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const updateRequirementSchema = z.object({
  organizationId: z.string().uuid(),
  requirementId: z.string().uuid(),
  version: z.number().int().positive(),
  text: z.string().trim().min(3).max(4000).optional(),
  textAr: z.string().trim().max(4000).optional().nullable(),
  category: z.string().trim().max(120).optional(),
  criticality: z.enum(["standard", "critical"]).optional(),
  status: z.enum(["needs_review", "reviewed", "exception", "excluded"]).optional(),
  overrideReason: z.string().trim().max(500).optional().nullable(),
});

export const resolveExceptionSchema = z.object({
  organizationId: z.string().uuid(),
  exceptionId: z.string().uuid(),
  status: z.enum(["open", "resolved", "overridden"]),
  resolutionNote: z.string().trim().max(1000).optional().nullable(),
});

export const submitReviewSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const decideReviewSchema = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type CreateTenderInput = z.infer<typeof createTenderSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;
