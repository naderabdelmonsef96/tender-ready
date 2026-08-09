import { z } from "zod";

export const orgTenderSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
});

export const runMatchSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const decideMatchSchema = z.object({
  organizationId: z.string().uuid(),
  boqItemId: z.string().uuid(),
  state: z.enum(["unmatched", "suggested", "confirmed", "out_of_portfolio"]),
  productId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  version: z.number().int().positive().optional(),
});

export const submitStageSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const decideStageSchema = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const upsertProductSchema = z
  .object({
    organizationId: z.string().uuid(),
    productId: z.string().uuid().optional().nullable(),
    catalogueId: z.string().uuid().optional().nullable(),
    code: z.string().trim().min(1).max(80).optional().nullable(),
    supplierCode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(300),
    nameAr: z.string().trim().max(300).optional().nullable(),
    unit: z.string().trim().max(40).optional().nullable(),
    brand: z.string().trim().max(120).optional().nullable(),
    category: z.string().trim().max(120).optional().nullable(),
    baseCost: z.number().nonnegative().optional().nullable(),
    currency: z.string().trim().min(3).max(3).default("EGP"),
    incoterm: z.string().trim().max(10).optional().nullable(),
    landingCost: z.number().nonnegative().optional().nullable(),
    landingCostCurrency: z.string().trim().min(3).max(3).optional().nullable(),
    isActive: z.boolean().default(true),
    stockQuantity: z.number().nonnegative().optional().nullable(),
    leadTimeDays: z.number().int().nonnegative().optional().nullable(),
    specs: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(80),
          value: z.string().trim().min(1).max(200),
          unit: z.string().trim().max(40).optional().nullable(),
        }),
      )
      .max(40)
      .optional(),
  })
  .refine((value) => !value.isActive || Boolean(value.code?.trim()), {
    message: "Active SKUs need an Icode.",
    path: ["code"],
  });

export const deleteProductSchema = z.object({
  organizationId: z.string().uuid(),
  productId: z.string().uuid(),
});

export const setRouteSchema = z.object({
  organizationId: z.string().uuid(),
  boqItemId: z.string().uuid(),
  route: z.enum(["ex_stock", "import", "local_supplier", "foreign_rfq"]),
  productId: z.string().uuid().optional().nullable(),
  supplierQuoteId: z.string().uuid().optional().nullable(),
  warehouse: z.string().trim().max(120).optional().nullable(),
  originCountry: z.string().trim().max(120).optional().nullable(),
  incoterm: z.string().trim().max(40).optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  version: z.number().int().positive().optional(),
});

export const saveQuoteSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  boqItemId: z.string().uuid(),
  quoteId: z.string().uuid().optional().nullable(),
  supplierName: z.string().trim().min(2).max(200),
  kind: z.enum(["local", "foreign"]),
  currency: z.string().trim().min(3).max(3),
  unitCost: z.number().nonnegative().optional().nullable(),
  incoterm: z.string().trim().max(40).optional().nullable(),
  leadTimeDays: z.number().int().nonnegative().optional().nullable(),
  validUntil: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type UpsertProductInput = z.infer<typeof upsertProductSchema>;
export type SetRouteInput = z.infer<typeof setRouteSchema>;
export type SaveQuoteInput = z.infer<typeof saveQuoteSchema>;
