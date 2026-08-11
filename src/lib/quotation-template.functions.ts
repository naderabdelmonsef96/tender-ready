import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgInput = z.object({ organizationId: z.string().uuid() });
const parseOrg = (input: unknown) => orgInput.parse(input);

const TEMPLATE_FILENAME = "template.docx";

export function quotationTemplatePath(organizationId: string): string {
  return `${organizationId}/${TEMPLATE_FILENAME}`;
}

export const getQuotationTemplateInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const [listing, { data: isAdmin }] = await Promise.all([
      context.supabase.storage.from("quotation-templates").list(data.organizationId, {
        search: TEMPLATE_FILENAME,
      }),
      context.supabase.rpc("has_org_role", { _org: data.organizationId, _role: "org_admin" }),
    ]);
    if (listing.error) throw new Error(listing.error.message);
    const file = listing.data?.find((entry) => entry.name === TEMPLATE_FILENAME) ?? null;
    return {
      isAdmin: isAdmin === true,
      template: file
        ? {
            uploadedAt: file.updated_at ?? file.created_at ?? null,
            sizeBytes: (file.metadata?.size as number | undefined) ?? null,
          }
        : null,
    };
  });
