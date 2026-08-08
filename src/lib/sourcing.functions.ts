import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRODUCT_SELECT } from "@/lib/portfolio-map";
import {
  orgTenderSchema,
  saveQuoteSchema,
  setRouteSchema,
  submitStageSchema,
} from "@/lib/portfolio-schemas";

export const getSourcingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tender, items, matches, routes, quotes, products, tasks, membership, stage] =
      await Promise.all([
        supabase
          .from("tenders")
          .select("id, reference, title, title_ar, currency, current_stage, stage_state")
          .eq("organization_id", data.organizationId)
          .eq("id", data.tenderId)
          .maybeSingle(),
        supabase
          .from("boq_items")
          .select(
            "id, item_code, description, description_ar, unit, quantity, criticality, sheet_name",
          )
          .eq("organization_id", data.organizationId)
          .eq("tender_id", data.tenderId)
          .neq("status", "excluded")
          .order("sheet_index")
          .order("display_order"),
        supabase
          .from("portfolio_matches")
          .select("boq_item_id, product_id, state, override_reason")
          .eq("organization_id", data.organizationId)
          .eq("tender_id", data.tenderId),
        supabase
          .from("sourcing_routes")
          .select(
            "id, boq_item_id, route, product_id, supplier_quote_id, warehouse, origin_country, incoterm, lead_time_days, note, version, decided_by, decided_at",
          )
          .eq("organization_id", data.organizationId)
          .eq("tender_id", data.tenderId),
        supabase
          .from("supplier_quotes")
          .select(
            "id, boq_item_id, supplier_name, kind, currency, unit_cost, incoterm, lead_time_days, valid_until, note",
          )
          .eq("organization_id", data.organizationId)
          .eq("tender_id", data.tenderId)
          .order("created_at"),
        supabase
          .from("catalogue_products")
          .select(PRODUCT_SELECT)
          .eq("organization_id", data.organizationId)
          .eq("is_active", true)
          .order("code"),
        supabase
          .from("approval_tasks")
          .select("id, stage, state, approver_role, submitted_by, submitted_at, invalidated_reason")
          .eq("organization_id", data.organizationId)
          .eq("tender_id", data.tenderId)
          .eq("stage", "sourcing")
          .order("submitted_at", { ascending: false }),
        supabase
          .from("organization_memberships")
          .select("role")
          .eq("organization_id", data.organizationId)
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("workflow_stages")
          .select("stage, approver_role, name, name_ar")
          .eq("organization_id", data.organizationId)
          .eq("stage", "sourcing")
          .maybeSingle(),
      ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");
    if (items.error) throw new Error(items.error.message);

    const activeTask =
      (tasks.data ?? []).find((task) =>
        ["submitted", "in_review", "changes_requested"].includes(task.state),
      ) ?? null;

    return {
      tender: tender.data,
      items: items.data ?? [],
      matches: matches.data ?? [],
      routes: routes.data ?? [],
      quotes: quotes.data ?? [],
      products: products.data ?? [],
      tasks: tasks.data ?? [],
      activeTask,
      sourcingStage: stage.data ?? null,
      myRole: membership.data?.role ?? null,
      userId,
    };
  });

export const setSourcingRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setRouteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit, invalidateDownstream } = await import("@/lib/intake-db.server");

    const item = await supabase
      .from("boq_items")
      .select("id, tender_id, description")
      .eq("organization_id", data.organizationId)
      .eq("id", data.boqItemId)
      .maybeSingle();
    if (item.error) throw new Error(item.error.message);
    if (!item.data) throw new Error("BOQ item not found");

    const companyRoute = data.route === "ex_stock" || data.route === "import";
    if (companyRoute && !data.productId) {
      throw new Error("Ex-stock and import routes need a portfolio product.");
    }
    if (!companyRoute && !data.supplierQuoteId) {
      throw new Error("A local supplier or foreign RFQ route needs a recorded supplier quote.");
    }

    const existing = await supabase
      .from("sourcing_routes")
      .select("id, version, route, product_id, supplier_quote_id")
      .eq("organization_id", data.organizationId)
      .eq("boq_item_id", data.boqItemId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data && data.version && existing.data.version !== data.version) {
      throw new Error("This route changed since you loaded it. Reload and try again.");
    }

    const { data: saved, error } = await supabase
      .from("sourcing_routes")
      .upsert(
        {
          organization_id: data.organizationId,
          tender_id: item.data.tender_id,
          boq_item_id: data.boqItemId,
          route: data.route,
          product_id: companyRoute ? (data.productId ?? null) : null,
          supplier_quote_id: companyRoute ? null : (data.supplierQuoteId ?? null),
          warehouse: data.warehouse ?? null,
          origin_country: data.originCountry ?? null,
          incoterm: data.incoterm ?? null,
          lead_time_days: data.leadTimeDays ?? null,
          note: data.note ?? null,
          decided_by: userId,
          decided_at: new Date().toISOString(),
          version: (existing.data?.version ?? 0) + 1,
          created_by: userId,
        },
        { onConflict: "boq_item_id" },
      )
      .select("id, route, version, product_id, supplier_quote_id")
      .single();
    if (error) throw new Error(error.message);

    const material = existing.data ? existing.data.route !== saved.route : false;
    let invalidatedApprovals = 0;
    if (material) {
      invalidatedApprovals = await invalidateDownstream(supabase, {
        organizationId: data.organizationId,
        tenderId: item.data.tender_id,
        reason: "A supply route changed after submission.",
      });
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `sourcing_route.${data.route}`,
      objectType: "sourcing_route",
      objectId: saved.id,
      objectVersion: saved.version,
      isMaterial: true,
      summary: item.data.description.slice(0, 160),
    });

    return { route: saved, invalidatedApprovals };
  });

export const saveSupplierQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveQuoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const row = {
      organization_id: data.organizationId,
      tender_id: data.tenderId,
      boq_item_id: data.boqItemId,
      supplier_name: data.supplierName,
      kind: data.kind,
      currency: data.currency,
      unit_cost: data.unitCost ?? null,
      incoterm: data.incoterm ?? null,
      lead_time_days: data.leadTimeDays ?? null,
      valid_until: data.validUntil ?? null,
      note: data.note ?? null,
      created_by: userId,
    };

    const saved = data.quoteId
      ? await supabase
          .from("supplier_quotes")
          .update(row)
          .eq("organization_id", data.organizationId)
          .eq("id", data.quoteId)
          .select("id, supplier_name, kind, currency, unit_cost")
          .single()
      : await supabase
          .from("supplier_quotes")
          .insert(row)
          .select("id, supplier_name, kind, currency, unit_cost")
          .single();
    if (saved.error) throw new Error(saved.error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: data.quoteId ? "supplier_quote.updated" : "supplier_quote.created",
      objectType: "supplier_quote",
      objectId: saved.data.id,
      isMaterial: true,
      summary: `${data.supplierName} (${data.kind})`,
    });

    return { quote: saved.data };
  });

export const submitSourcingForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const [items, routes, stage] = await Promise.all([
      supabase
        .from("boq_items")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded"),
      supabase
        .from("sourcing_routes")
        .select("boq_item_id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("workflow_stages")
        .select("approver_role")
        .eq("organization_id", data.organizationId)
        .eq("stage", "sourcing")
        .maybeSingle(),
    ]);

    const rows = items.data ?? [];
    if (rows.length === 0) throw new Error("There is nothing to submit yet.");
    const routed = new Set((routes.data ?? []).map((route) => route.boq_item_id));
    const missing = rows.filter((row) => !routed.has(row.id));
    if (missing.length > 0) {
      throw new Error(`${missing.length} item(s) still have no supply route.`);
    }

    const { data: task, error } = await supabase
      .from("approval_tasks")
      .insert({
        organization_id: data.organizationId,
        tender_id: data.tenderId,
        stage: "sourcing",
        object_type: "sourcing_route",
        approver_role: stage.data?.approver_role ?? "sourcing_manager",
        state: "submitted",
        submitted_by: userId,
      })
      .select("id, state, approver_role")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("tenders")
      .update({ current_stage: "sourcing", stage_state: "submitted" })
      .eq("organization_id", data.organizationId)
      .eq("id", data.tenderId);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "sourcing_route.submitted",
      objectType: "sourcing_route",
      objectId: data.tenderId,
      isMaterial: true,
      summary: data.note ?? `${rows.length} routes submitted for sourcing approval`,
    });

    return { task };
  });
