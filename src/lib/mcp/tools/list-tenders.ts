import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failed, notAuthenticated, ok, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tenders",
  title: "List tenders",
  description:
    "List tenders in one of the signed-in user's organizations, newest first. Optionally filter by workflow stage or status.",
  inputSchema: {
    organizationId: z.string().uuid().describe("Organization id from list_organizations."),
    status: z
      .enum(["open", "won", "lost", "cancelled", "archived"])
      .nullable()
      .describe("Optional tender status filter; null for all."),
    limit: z.number().int().min(1).max(100).nullable().describe("Maximum rows to return; null means 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("tenders")
      .select(
        "id, reference, title, title_ar, status, current_stage, stage_state, currency, estimated_value, submission_deadline, project_location, version, created_at, clients(name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return failed(error.message);

    return ok({
      count: data?.length ?? 0,
      tenders: (data ?? []).map((t) => ({
        id: t.id,
        reference: t.reference,
        title: t.title,
        titleAr: t.title_ar,
        client: t.clients?.name ?? null,
        status: t.status,
        stage: t.current_stage,
        stageState: t.stage_state,
        currency: t.currency,
        estimatedValue: t.estimated_value,
        submissionDeadline: t.submission_deadline,
        location: t.project_location,
        version: t.version,
      })),
    });
  },
});
