import { defineTool } from "@lovable.dev/mcp-js";

import { failed, notAuthenticated, ok, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_organizations",
  title: "List my organizations",
  description:
    "List the TenderReady organizations the signed-in user belongs to, with their role in each. Call this first to get an organization id for the other tools.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("organization_memberships")
      .select("role, status, organization_id, organizations(id, name, name_ar, slug, base_currency)")
      .eq("status", "active");

    if (error) return failed(error.message);

    return ok({
      organizations: (data ?? []).map((m) => ({
        organizationId: m.organization_id,
        role: m.role,
        name: m.organizations?.name ?? null,
        nameAr: m.organizations?.name_ar ?? null,
        baseCurrency: m.organizations?.base_currency ?? null,
      })),
    });
  },
});
