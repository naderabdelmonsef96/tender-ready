import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failed, notAuthenticated, ok, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_tender",
  title: "Get tender",
  description:
    "Get one tender by id, including its client, workflow stage, decision state, and the organization's approval stages.",
  inputSchema: {
    tenderId: z.string().uuid().describe("Tender id from list_tenders."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tenderId }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: tender, error } = await supabase
      .from("tenders")
      .select(
        "id, organization_id, reference, title, title_ar, status, current_stage, stage_state, currency, estimated_value, submission_deadline, project_location, notes, version, created_at, updated_at, clients(id, name, name_ar, contact_person, email, country)",
      )
      .eq("id", tenderId)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!tender) return failed("Tender not found, or you do not have access to it.");

    const { data: stages } = await supabase
      .from("workflow_stages")
      .select("stage, name, name_ar, approver_role, blocks_release, sort_order")
      .eq("organization_id", tender.organization_id)
      .order("sort_order", { ascending: true });

    return ok({
      tender: {
        id: tender.id,
        organizationId: tender.organization_id,
        reference: tender.reference,
        title: tender.title,
        titleAr: tender.title_ar,
        status: tender.status,
        stage: tender.current_stage,
        stageState: tender.stage_state,
        currency: tender.currency,
        estimatedValue: tender.estimated_value,
        submissionDeadline: tender.submission_deadline,
        location: tender.project_location,
        notes: tender.notes,
        version: tender.version,
        createdAt: tender.created_at,
        updatedAt: tender.updated_at,
        client: tender.clients ?? null,
      },
      workflowStages: stages ?? [],
    });
  },
});
