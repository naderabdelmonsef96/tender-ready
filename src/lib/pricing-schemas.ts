import { z } from "zod";

export const savePricingLineSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  boqItemId: z.string().uuid(),
  costBasisAmount: z.number().positive(),
  costBasisCurrency: z.string().trim().length(3),
  costBasisSource: z.enum(["landing_cost", "supplier_price", "supplier_quote", "manual"]),
  fxRate: z.number().positive().default(1),
  freightMode: z.enum(["value", "percent"]).default("value"),
  freightInput: z.number().min(0).default(0),
  localMode: z.enum(["value", "percent"]).default("value"),
  localInput: z.number().min(0).default(0),
  marginPercent: z.number().min(0).lt(100),
  note: z.string().trim().max(1000).optional().nullable(),
  version: z.number().int().positive().optional(),
});

export const releaseQuotationSchema = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  currency: z.string().trim().length(3),
  fxRates: z.record(z.string(), z.number().positive()).optional(),
  vatPercent: z.number().min(0).max(100).default(0),
  discount: z.number().min(0).default(0),
  otherCharges: z.number().min(0).default(0),
  paymentTerms: z.string().trim().max(500).optional().nullable(),
  deliveryTerms: z.string().trim().max(500).optional().nullable(),
  warranty: z.string().trim().max(500).optional().nullable(),
  incoterms: z.string().trim().max(200).optional().nullable(),
  notesAssumptions: z.string().trim().max(2000).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type SavePricingLineInput = z.infer<typeof savePricingLineSchema>;
export type ReleaseQuotationInput = z.infer<typeof releaseQuotationSchema>;
