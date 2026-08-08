import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failed, notAuthenticated, ok, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List the client companies recorded in one of the signed-in user's organizations.",
  inputSchema: {
    organizationId: z.string().uuid().describe("Organization id from list_organizations."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("clients")
      .select("id, name, name_ar, contact_person, email, phone, country, address")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) return failed(error.message);
    return ok({ count: data?.length ?? 0, clients: data ?? [] });
  },
});
