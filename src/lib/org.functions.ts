import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

const orgInput = z.object({ organizationId: z.string().uuid() });

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("organization_memberships")
        .select("id, role, status, organization_id, organizations(id, name, name_ar, slug, base_currency)")
        .eq("user_id", userId)
        .eq("status", "active"),
    ]);

    return {
      userId,
      profile: profile ?? null,
      memberships: (memberships ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        organizationId: m.organization_id,
        organization: m.organizations,
      })),
    };
  });

async function assertAdmin(
  supabase: { rpc: (fn: "has_org_role", args: { _org: string; _role: AppRole }) => PromiseLike<{ data: boolean | null }> },
  organizationId: string,
) {
  const { data } = await supabase.rpc("has_org_role", { _org: organizationId, _role: "org_admin" });
  if (!data) throw new Error("Forbidden: organization admin role required");
}

export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orgInput
      .extend({
        legal_name: z.string().min(2).max(200),
        legal_name_ar: z.string().max(200).nullable(),
        tax_number: z.string().max(60).nullable(),
        commercial_registration: z.string().max(60).nullable(),
        address_line1: z.string().max(200).nullable(),
        address_line2: z.string().max(200).nullable(),
        city: z.string().max(120).nullable(),
        country: z.string().min(2).max(2),
        phone: z.string().max(40).nullable(),
        email: z.string().email().nullable(),
        website: z.string().max(160).nullable(),
        bank_details: z.string().max(600).nullable(),
        quotation_number_pattern: z.string().min(3).max(60),
        quotation_validity_days: z.number().int().min(1).max(365),
        default_terms: z.string().max(4000).nullable(),
        footer_text: z.string().max(600).nullable(),
        signature_block: z.string().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, ...fields } = data;
    await assertAdmin(context.supabase, organizationId);

    const { error } = await context.supabase
      .from("company_settings")
      .update(fields)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "company_settings.updated",
      object_type: "company_settings",
      is_material: true,
      summary: "Company identity and quotation defaults updated",
    });

    return { ok: true };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orgInput
      .extend({
        email: z.string().email().max(200),
        role: z.enum([
          "org_admin",
          "proposal_engineer",
          "technical_lead",
          "product_manager",
          "sourcing_manager",
          "commercial_manager",
          "finance_manager",
          "signatory",
          "viewer",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.organizationId);

    const { error } = await context.supabase.from("organization_memberships").insert({
      organization_id: data.organizationId,
      invited_email: data.email.toLowerCase(),
      role: data.role,
      status: "invited",
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "membership.invited",
      object_type: "organization_membership",
      is_material: true,
      summary: `Invited ${data.email} as ${data.role}`,
    });

    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orgInput
      .extend({
        membershipId: z.string().uuid(),
        role: z.enum([
          "org_admin",
          "proposal_engineer",
          "technical_lead",
          "product_manager",
          "sourcing_manager",
          "commercial_manager",
          "finance_manager",
          "signatory",
          "viewer",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.organizationId);

    const { data: target, error: readError } = await context.supabase
      .from("organization_memberships")
      .select("id, user_id, organization_id")
      .eq("id", data.membershipId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!target) throw new Error("Membership not found in this organization");
    if (target.user_id === context.userId && data.role !== "org_admin") {
      throw new Error("An admin cannot remove their own admin role");
    }

    const { error } = await context.supabase
      .from("organization_memberships")
      .update({ role: data.role })
      .eq("id", data.membershipId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "membership.role_changed",
      object_type: "organization_membership",
      object_id: data.membershipId,
      is_material: true,
      summary: `Role changed to ${data.role}`,
    });

    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgInput.extend({ membershipId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.organizationId);

    const { error } = await context.supabase
      .from("organization_memberships")
      .delete()
      .eq("id", data.membershipId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_events").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "membership.removed",
      object_type: "organization_membership",
      object_id: data.membershipId,
      is_material: true,
      summary: "Membership removed",
    });

    return { ok: true };
  });
