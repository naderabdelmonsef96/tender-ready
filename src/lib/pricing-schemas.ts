import { z } from "zod";

export const savePricingLineSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
  boqItemId: z.string().uuid(),
  marginPercent: z.number().min(0).max(1000),
  note: z.string().trim().max(1000).optional().nullable(),
  version: z.number().int().positive().optional(),
});

export const releaseQuotationSchema = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  currency: z.string().trim().length(3),
  fxRates: z.record(z.string(), z.number().positive()).optional(),
  vatPercent: z.number().min(0).max(100).default(0),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type SavePricingLineInput = z.infer<typeof savePricingLineSchema>;
export type ReleaseQuotationInput = z.infer<typeof releaseQuotationSchema>;
