import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orgTenderSchema } from "@/lib/intake-schemas";
import type { Database } from "@/integrations/supabase/types";

type TenderStage = Database["public"]["Enums"]["tender_stage"];

export type GovernanceStageStatus = "passed" | "active" | "in_progress" | "rejected" | "pending";

export type GovernanceStage = {
  stage: TenderStage;
  name: string;
  nameAr: string | null;
  stageOrder: number;
  approverRole: string;
  slaHours: number | null;
  blocksRelease: boolean;
  status: GovernanceStageStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  submittedAt: string | null;
  waitingOnNames: string[];
};

export const getGovernanceTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [tenderRes, stagesRes, tasksRes, decisionsRes] = await Promise.all([
      supabase
        .from("tenders")
        .select("id, current_stage, stage_state, created_by, created_at")
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("workflow_stages")
        .select("id, stage, stage_order, name, name_ar, approver_role, sla_hours, blocks_release")
        .eq("organization_id", data.organizationId)
        .not("stage", "is", null)
        .order("stage_order"),
      supabase
        .from("approval_tasks")
        .select("stage, state, approver_role, submitted_at")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("approval_decisions")
        .select("stage, decision, decided_by, decided_at")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .order("decided_at", { ascending: false }),
    ]);
    if (tenderRes.error) throw new Error(tenderRes.error.message);
    if (!tenderRes.data) throw new Error("Tender not found");
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (decisionsRes.error) throw new Error(decisionsRes.error.message);

    const tender = tenderRes.data;
    const stages = stagesRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const decisions = decisionsRes.data ?? [];

    const latestTaskByStage = new Map<string, (typeof tasks)[number]>();
    for (const task of tasks) {
      if (!latestTaskByStage.has(task.stage)) latestTaskByStage.set(task.stage, task);
    }
    const latestApprovedByStage = new Map<string, (typeof decisions)[number]>();
    for (const decision of decisions) {
      if (decision.decision === "approved" && !latestApprovedByStage.has(decision.stage)) {
        latestApprovedByStage.set(decision.stage, decision);
      }
    }

    const currentIndex = stages.findIndex((s) => s.stage === tender.current_stage);

    const userIds = new Set<string>();
    for (const decision of latestApprovedByStage.values()) userIds.add(decision.decided_by);
    if (tender.created_by) userIds.add(tender.created_by);

    const currentStageRole = currentIndex >= 0 ? stages[currentIndex]?.approver_role : null;
    const isCurrentStageActive =
      tender.stage_state === "submitted" || tender.stage_state === "in_review";
    const roleHolders =
      currentStageRole && isCurrentStageActive
        ? await supabase
            .from("organization_memberships")
            .select("user_id")
            .eq("organization_id", data.organizationId)
            .eq("role", currentStageRole)
            .eq("status", "active")
        : { data: [] as { user_id: string }[] };
    for (const holder of roleHolders.data ?? []) {
      if (holder.user_id) userIds.add(holder.user_id);
    }

    const profiles = userIds.size
      ? await supabase.from("profiles").select("id, full_name, email").in("id", Array.from(userIds))
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const nameById = new Map(
      (profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "Unknown"]),
    );

    const result: GovernanceStage[] = stages.map((s, index) => {
      const approvedDecision = latestApprovedByStage.get(s.stage);
      const latestTask = latestTaskByStage.get(s.stage);

      let status: GovernanceStageStatus;
      if (index < currentIndex) {
        status = "passed";
      } else if (index > currentIndex) {
        status = "pending";
      } else if (tender.stage_state === "submitted" || tender.stage_state === "in_review") {
        status = "active";
      } else if (tender.stage_state === "changes_requested" || tender.stage_state === "rejected") {
        status = "rejected";
      } else {
        status = "in_progress";
      }

      let decidedByName: string | null = null;
      let decidedAt: string | null = null;
      if (s.stage === "intake" && status === "passed") {
        decidedByName = tender.created_by ? (nameById.get(tender.created_by) ?? null) : null;
        decidedAt = tender.created_at;
      } else if (approvedDecision) {
        decidedByName = nameById.get(approvedDecision.decided_by) ?? null;
        decidedAt = approvedDecision.decided_at;
      }

      const waitingOnNames =
        status === "active"
          ? (roleHolders.data ?? [])
              .filter((h): h is { user_id: string } => Boolean(h.user_id))
              .map((h) => nameById.get(h.user_id) ?? "Unknown")
          : [];

      return {
        stage: s.stage as TenderStage,
        name: s.name,
        nameAr: s.name_ar,
        stageOrder: s.stage_order,
        approverRole: s.approver_role,
        slaHours: s.sla_hours,
        blocksRelease: s.blocks_release,
        status,
        decidedByName,
        decidedAt,
        submittedAt: latestTask?.submitted_at ?? null,
        waitingOnNames,
      };
    });

    return { currentStage: tender.current_stage, stages: result };
  });
