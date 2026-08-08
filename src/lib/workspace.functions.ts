import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type TenderStage = Database["public"]["Enums"]["tender_stage"];
export type DecisionState = Database["public"]["Enums"]["decision_state"];
export type TenderStatus = Database["public"]["Enums"]["tender_status"];

const orgInput = z.object({ organizationId: z.string().uuid() });
const parseOrg = (input: unknown) => orgInput.parse(input);

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [tendersResult, flagsResult] = await Promise.all([
      supabase
        .from("tenders")
        .select(
          "id, reference, title, title_ar, project_location, submission_deadline, currency, estimated_value, current_stage, stage_state, status, updated_at, clients(id, name, name_ar)",
        )
        .eq("organization_id", data.organizationId)
        .order("submission_deadline", { ascending: true, nullsFirst: false }),
      supabase
        .from("feature_flags")
        .select("flag_key, enabled")
        .eq("organization_id", data.organizationId),
    ]);

    if (tendersResult.error) throw new Error(tendersResult.error.message);

    const tenders = tendersResult.data ?? [];
    const now = Date.now();
    const fourteenDays = now + 14 * 24 * 60 * 60 * 1000;

    return {
      tenders: tenders.map((t) => ({
        id: t.id,
        reference: t.reference,
        title: t.title,
        titleAr: t.title_ar,
        location: t.project_location,
        deadline: t.submission_deadline,
        currency: t.currency,
        estimatedValue: t.estimated_value,
        stage: t.current_stage,
        stageState: t.stage_state,
        status: t.status,
        updatedAt: t.updated_at,
        client: t.clients
          ? { id: t.clients.id, name: t.clients.name, nameAr: t.clients.name_ar }
          : null,
      })),
      summary: {
        open: tenders.filter((t) => t.status === "open").length,
        awaitingApproval: tenders.filter(
          (t) => t.stage_state === "submitted" || t.stage_state === "in_review",
        ).length,
        deadlineSoon: tenders.filter((t) => {
          if (!t.submission_deadline) return false;
          const at = new Date(t.submission_deadline).getTime();
          return at >= now && at <= fourteenDays;
        }).length,
        released: tenders.filter((t) => t.stage_state === "released").length,
      },
      flags: Object.fromEntries((flagsResult.data ?? []).map((f) => [f.flag_key, f.enabled])),
    };
  });

export const getApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: membership }, { data: stages }, tendersResult] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", data.organizationId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("workflow_stages")
        .select("stage, name, name_ar, approver_role, sla_hours, stage_order")
        .eq("organization_id", data.organizationId)
        .order("stage_order"),
      supabase
        .from("tenders")
        .select(
          "id, reference, title, current_stage, stage_state, created_by, owner_id, updated_at",
        )
        .eq("organization_id", data.organizationId)
        .in("stage_state", ["submitted", "in_review", "changes_requested"]),
    ]);

    if (tendersResult.error) throw new Error(tendersResult.error.message);

    const myRole = membership?.role ?? null;
    const stageList = stages ?? [];

    const items = (tendersResult.data ?? []).map((t) => {
      const stage = stageList.find((s) => s.stage === t.current_stage) ?? null;
      const isMine = t.created_by === userId;
      return {
        tenderId: t.id,
        reference: t.reference,
        title: t.title,
        stage: t.current_stage,
        stageState: t.stage_state,
        stageName: stage?.name ?? null,
        stageNameAr: stage?.name_ar ?? null,
        approverRole: stage?.approver_role ?? null,
        slaHours: stage?.sla_hours ?? null,
        updatedAt: t.updated_at,
        isForMyRole:
          !!stage && !!myRole && (stage.approver_role === myRole || myRole === "org_admin"),
        selfApprovalBlocked: isMine,
      };
    });

    return { myRole, items };
  });

export const getAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orgInput.extend({ limit: z.number().int().min(1).max(200).default(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: events, error } = await context.supabase
      .from("audit_events")
      .select(
        "id, actor_email, actor_id, action, object_type, object_id, is_material, summary, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { events: events ?? [] };
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const [templatesResult, stagesResult, flagsResult] = await Promise.all([
      context.supabase
        .from("workflow_templates")
        .select("id, name, name_ar, description, version, is_active")
        .eq("organization_id", data.organizationId)
        .order("version", { ascending: false }),
      context.supabase
        .from("workflow_stages")
        .select(
          "id, stage, stage_order, name, name_ar, approver_role, sla_hours, blocks_release, requires_note_on_reject",
        )
        .eq("organization_id", data.organizationId)
        .order("stage_order"),
      context.supabase
        .from("feature_flags")
        .select("flag_key, enabled")
        .eq("organization_id", data.organizationId),
    ]);

    if (stagesResult.error) throw new Error(stagesResult.error.message);

    return {
      templates: templatesResult.data ?? [],
      stages: stagesResult.data ?? [],
      flags: Object.fromEntries((flagsResult.data ?? []).map((f) => [f.flag_key, f.enabled])),
    };
  });

export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const [{ data: settings, error }, { data: isAdmin }] = await Promise.all([
      context.supabase
        .from("company_settings")
        .select("*")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
      context.supabase.rpc("has_org_role", { _org: data.organizationId, _role: "org_admin" }),
    ]);
    if (error) throw new Error(error.message);
    return { settings: settings ?? null, isAdmin: isAdmin === true };
  });

export const getMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const [membershipsResult, { data: isAdmin }] = await Promise.all([
      context.supabase
        .from("organization_memberships")
        .select("id, user_id, invited_email, role, status, created_at")
        .eq("organization_id", data.organizationId)
        .order("created_at"),
      context.supabase.rpc("has_org_role", { _org: data.organizationId, _role: "org_admin" }),
    ]);
    if (membershipsResult.error) throw new Error(membershipsResult.error.message);

    const memberships = membershipsResult.data ?? [];
    const userIds = memberships.map((m) => m.user_id).filter((id): id is string => !!id);

    const profiles = userIds.length
      ? ((
          await context.supabase
            .from("profiles")
            .select("id, full_name, full_name_ar, email, job_title")
            .in("id", userIds)
        ).data ?? [])
      : [];

    return {
      isAdmin: isAdmin === true,
      currentUserId: context.userId,
      members: memberships.map((m) => {
        const profile = m.user_id ? (profiles.find((p) => p.id === m.user_id) ?? null) : null;
        return {
          id: m.id,
          userId: m.user_id,
          role: m.role,
          status: m.status,
          createdAt: m.created_at,
          email: profile?.email ?? m.invited_email,
          fullName: profile?.full_name ?? null,
          fullNameAr: profile?.full_name_ar ?? null,
          jobTitle: profile?.job_title ?? null,
        };
      }),
    };
  });

export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOrg)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, title, body, link_path, severity, read_at, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { notifications: rows ?? [] };
  });
