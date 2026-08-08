import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failed, notAuthenticated, ok, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_tender",
  title: "Create tender",
  description:
    "Create a draft tender header in one of the signed-in user's organizations. Only proposal engineers and organization admins may create tenders. Does not upload files or invent commercial values.",
  inputSchema: {
    organizationId: z.string().uuid().describe("Organization id from list_organizations."),
    reference: z.string().trim().min(2).max(60).describe("Unique tender reference, e.g. TND-2026-014."),
    title: z.string().trim().min(3).max(300).describe("Tender title in English."),
    titleAr: z.string().trim().max(300).nullable().describe("Tender title in Arabic, or null."),
    clientId: z.string().uuid().nullable().describe("Client id from list_clients, or null if not yet known."),
    projectLocation: z.string().trim().max(200).nullable().describe("Project location, or null."),
    submissionDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .describe("Submission deadline as YYYY-MM-DD, or null."),
    notes: z.string().trim().max(2000).nullable().describe("Free-text notes, or null."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: allowed, error: roleError } = await supabase.rpc("has_any_org_role", {
      _org: input.organizationId,
      _roles: ["org_admin", "proposal_engineer"],
    });
    if (roleError) return failed(roleError.message);
    if (!allowed) {
      throw new ToolError("Only organization admins and proposal engineers may create tenders.");
    }

    const { data, error } = await supabase
      .from("tenders")
      .insert({
        organization_id: input.organizationId,
        reference: input.reference,
        title: input.title,
        title_ar: input.titleAr,
        client_id: input.clientId,
        project_location: input.projectLocation,
        submission_deadline: input.submissionDeadline,
        notes: input.notes,
        created_by: ctx.getUserId(),
        owner_id: ctx.getUserId(),
      })
      .select("id, reference, title, status, current_stage, stage_state, version")
      .single();

    if (error) return failed(error.message);

    await supabase.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_id: ctx.getUserId(),
      action: "tender.created",
      object_type: "tender",
      object_id: data.id,
      is_material: true,
      summary: `Tender ${data.reference} created via agent integration`,
    });

    return ok({ tender: data });
  },
});
