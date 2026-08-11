import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rankCandidates } from "@/lib/match-engine";
import { NEXT_STAGE, PRODUCT_SELECT, toMatchProduct } from "@/lib/portfolio-map";
import {
  decideMatchSchema,
  decideStageSchema,
  deleteProductSchema,
  orgTenderSchema,
  runMatchSchema,
  submitStageSchema,
  upsertProductSchema,
} from "@/lib/portfolio-schemas";

export const getPortfolioBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tender, items, matches, products, tasks, membership, stage] = await Promise.all([
      supabase
        .from("tenders")
        .select("id, reference, title, title_ar, currency, current_stage, stage_state")
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("boq_items")
        .select(
          "id, item_code, description, description_ar, unit, quantity, section_path, criticality, status, source_reference_id, override_reason, sheet_name",
        )
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded")
        .order("sheet_index")
        .order("display_order"),
      supabase
        .from("portfolio_matches")
        .select(
          "id, boq_item_id, product_id, state, score, matched_on, failed_on, override_reason, note, decided_by, decided_at, version",
        )
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
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
        .eq("stage", "product")
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
        .eq("stage", "product")
        .maybeSingle(),
    ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");
    if (items.error) throw new Error(items.error.message);
    if (products.error) throw new Error(products.error.message);

    const activeTask =
      (tasks.data ?? []).find((task) =>
        ["submitted", "in_review", "changes_requested"].includes(task.state),
      ) ?? null;

    return {
      tender: tender.data,
      items: items.data ?? [],
      matches: matches.data ?? [],
      products: products.data ?? [],
      tasks: tasks.data ?? [],
      activeTask,
      productStage: stage.data ?? null,
      myRole: membership.data?.role ?? null,
      userId,
    };
  });

export const runPortfolioMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runMatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const [items, matches, products] = await Promise.all([
      supabase
        .from("boq_items")
        .select("id, description, description_ar, unit, section_path")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded"),
      supabase
        .from("portfolio_matches")
        .select("id, boq_item_id, state")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("catalogue_products")
        .select(PRODUCT_SELECT)
        .eq("organization_id", data.organizationId)
        .eq("is_active", true),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (products.error) throw new Error(products.error.message);

    const rows = items.data ?? [];
    if (rows.length === 0) {
      throw new Error("There is nothing to match yet — review the requirements register first.");
    }
    const catalogue = (products.data ?? []).map(toMatchProduct);
    if (catalogue.length === 0) {
      throw new Error("Your product catalogue is empty. Add products in Settings → Catalogues.");
    }

    // Decided rows are never overwritten by a re-run.
    const decided = new Set(
      (matches.data ?? [])
        .filter((match) => match.state === "confirmed" || match.state === "out_of_portfolio")
        .map((match) => match.boq_item_id),
    );

    let suggested = 0;
    let unmatched = 0;
    const payload = rows
      .filter((row) => !decided.has(row.id))
      .map((row) => {
        const ranked = rankCandidates(
          {
            description: [row.description, row.description_ar ?? ""].join(" "),
            unit: row.unit,
            sectionPath: row.section_path,
          },
          catalogue,
        );
        const best = ranked[0] ?? null;
        if (best) suggested += 1;
        else unmatched += 1;
        return {
          organization_id: data.organizationId,
          tender_id: data.tenderId,
          boq_item_id: row.id,
          product_id: best?.productId ?? null,
          state: (best ? "suggested" : "unmatched") as "suggested" | "unmatched",
          score: best?.score ?? null,
          matched_on: (best?.matchedOn ?? []) as never,
          failed_on: (best?.failedOn ?? []) as never,
          created_by: userId,
        };
      });

    for (let offset = 0; offset < payload.length; offset += 500) {
      const { error } = await supabase
        .from("portfolio_matches")
        .upsert(payload.slice(offset, offset + 500), { onConflict: "boq_item_id" });
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "portfolio_match.run",
      objectType: "portfolio_match_run",
      objectId: data.tenderId,
      isMaterial: false,
      summary: `${suggested} suggestion(s), ${unmatched} item(s) with no candidate`,
      metadata: { idempotencyKey: data.idempotencyKey, catalogueSize: catalogue.length },
    });

    return { suggested, unmatched, skipped: decided.size };
  });

export const decideMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideMatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit, invalidateDownstream } = await import("@/lib/intake-db.server");

    const item = await supabase
      .from("boq_items")
      .select("id, tender_id, description, criticality, source_reference_id, override_reason")
      .eq("organization_id", data.organizationId)
      .eq("id", data.boqItemId)
      .maybeSingle();
    if (item.error) throw new Error(item.error.message);
    if (!item.data) throw new Error("BOQ item not found");

    if (data.state === "confirmed" && !data.productId) {
      throw new Error("Confirming a match needs a product.");
    }
    if (data.state === "out_of_portfolio" && !data.overrideReason) {
      throw new Error("Marking an item outside the portfolio needs a written reason.");
    }
    if (
      data.state === "confirmed" &&
      item.data.criticality === "critical" &&
      !item.data.source_reference_id &&
      !data.overrideReason
    ) {
      throw new Error(
        "A critical item with no source reference needs a named override with a reason before it can be confirmed.",
      );
    }

    const existing = await supabase
      .from("portfolio_matches")
      .select("id, version, state, product_id")
      .eq("organization_id", data.organizationId)
      .eq("boq_item_id", data.boqItemId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data && data.version && existing.data.version !== data.version) {
      throw new Error("This match changed since you loaded it. Reload and try again.");
    }

    const patch = {
      organization_id: data.organizationId,
      tender_id: item.data.tender_id,
      boq_item_id: data.boqItemId,
      product_id: data.state === "out_of_portfolio" ? null : (data.productId ?? null),
      state: data.state,
      override_reason: data.overrideReason ?? null,
      note: data.note ?? null,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      version: (existing.data?.version ?? 0) + 1,
      created_by: userId,
    };

    const { data: saved, error } = await supabase
      .from("portfolio_matches")
      .upsert(patch, { onConflict: "boq_item_id" })
      .select("id, state, version, product_id")
      .single();
    if (error) throw new Error(error.message);

    const material =
      existing.data?.state !== data.state || existing.data?.product_id !== saved.product_id;
    let invalidatedApprovals = 0;
    if (material && existing.data) {
      invalidatedApprovals = await invalidateDownstream(supabase, {
        organizationId: data.organizationId,
        tenderId: item.data.tender_id,
        reason: "A confirmed portfolio match changed after submission.",
      });
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `portfolio_match.${data.state}`,
      objectType: "portfolio_match",
      objectId: saved.id,
      objectVersion: saved.version,
      isMaterial: material,
      summary: data.note ?? data.overrideReason ?? item.data.description.slice(0, 160),
    });

    return { match: saved, invalidatedApprovals };
  });

export const clearMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    decideMatchSchema.pick({ organizationId: true, boqItemId: true }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const { error } = await supabase
      .from("portfolio_matches")
      .update({
        state: "unmatched",
        product_id: null,
        override_reason: null,
        note: null,
        decided_by: null,
        decided_at: null,
      })
      .eq("organization_id", data.organizationId)
      .eq("boq_item_id", data.boqItemId);
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "portfolio_match.cleared",
      objectType: "portfolio_match",
      objectId: data.boqItemId,
      isMaterial: true,
    });

    return { ok: true };
  });

export const submitPortfolioForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const [items, matches, stage] = await Promise.all([
      supabase
        .from("boq_items")
        .select("id, criticality, source_reference_id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded"),
      supabase
        .from("portfolio_matches")
        .select("boq_item_id, state, override_reason")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("workflow_stages")
        .select("approver_role")
        .eq("organization_id", data.organizationId)
        .eq("stage", "product")
        .maybeSingle(),
    ]);

    const rows = items.data ?? [];
    if (rows.length === 0) throw new Error("There is nothing to submit yet.");
    const decided = new Map((matches.data ?? []).map((match) => [match.boq_item_id, match]));
    const undecided = rows.filter((row) => {
      const match = decided.get(row.id);
      return !match || (match.state !== "confirmed" && match.state !== "out_of_portfolio");
    });
    if (undecided.length > 0) {
      throw new Error(
        `${undecided.length} item(s) still have no named portfolio decision. Confirm a product or mark them outside the portfolio.`,
      );
    }

    const { data: task, error } = await supabase
      .from("approval_tasks")
      .insert({
        organization_id: data.organizationId,
        tender_id: data.tenderId,
        stage: "product",
        object_type: "portfolio_match",
        approver_role: stage.data?.approver_role ?? "product_manager",
        state: "submitted",
        submitted_by: userId,
      })
      .select("id, state, approver_role")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("tenders")
      .update({ current_stage: "product", stage_state: "submitted" })
      .eq("organization_id", data.organizationId)
      .eq("id", data.tenderId);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "portfolio_match.submitted",
      objectType: "portfolio_match",
      objectId: data.tenderId,
      isMaterial: true,
      summary: data.note ?? `${rows.length} items submitted for portfolio approval`,
    });

    return { task };
  });

/** Generic stage decision used by the portfolio and sourcing gates. */
export const decideStageApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    if (data.decision !== "approved" && !data.note) {
      throw new Error("A rejection or change request needs a note.");
    }

    const task = await supabase
      .from("approval_tasks")
      .select("id, tender_id, stage, submitted_by, approver_role, state")
      .eq("organization_id", data.organizationId)
      .eq("id", data.taskId)
      .maybeSingle();
    if (task.error) throw new Error(task.error.message);
    if (!task.data) throw new Error("Approval task not found");

    const membership = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    const role = membership.data?.role ?? null;

    const isSelfSubmitted = task.data.submitted_by === userId;
    const isOverride = isSelfSubmitted && role === "org_admin";
    if (isSelfSubmitted && !isOverride) {
      throw new Error("You submitted this — maker-checker separation blocks self-approval.");
    }
    if (isOverride && !data.note) {
      throw new Error("An admin override needs a documented reason.");
    }
    if (!isSelfSubmitted && role !== "org_admin" && role !== task.data.approver_role) {
      throw new Error("Your role cannot decide this stage.");
    }

    const updated = await supabase
      .from("approval_tasks")
      .update({ state: data.decision })
      .eq("id", data.taskId)
      .select("id, state")
      .single();
    if (updated.error) throw new Error(updated.error.message);

    const decision = await supabase.from("approval_decisions").insert({
      organization_id: data.organizationId,
      tender_id: task.data.tender_id,
      task_id: data.taskId,
      stage: task.data.stage,
      decision: data.decision,
      note: data.note ?? null,
      decided_by: userId,
      is_override: isOverride,
    });
    if (decision.error) throw new Error(decision.error.message);

    await supabase
      .from("tenders")
      .update({
        stage_state: data.decision,
        current_stage:
          data.decision === "approved"
            ? (NEXT_STAGE[task.data.stage] ?? task.data.stage)
            : task.data.stage,
      })
      .eq("organization_id", data.organizationId)
      .eq("id", task.data.tender_id);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `${task.data.stage}_stage.${data.decision}${isOverride ? "_override" : ""}`,
      objectType: "approval_task",
      objectId: data.taskId,
      isMaterial: true,
      summary: isOverride ? `ADMIN OVERRIDE: ${data.note}` : (data.note ?? null),
    });

    return { task: updated.data };
  });

export const listCatalogueProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.pick({ organizationId: true }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [products, catalogues, membership] = await Promise.all([
      supabase
        .from("catalogue_products")
        .select(PRODUCT_SELECT)
        .eq("organization_id", data.organizationId)
        .order("is_active", { ascending: false })
        .order("supplier_code"),
      supabase
        .from("catalogues")
        .select("id, name, name_ar, is_active")
        .eq("organization_id", data.organizationId)
        .order("name"),
      supabase
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", data.organizationId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    if (products.error) throw new Error(products.error.message);
    return {
      products: products.data ?? [],
      catalogues: catalogues.data ?? [],
      myRole: membership.data?.role ?? null,
    };
  });

export const upsertCatalogueProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    let catalogueId = data.catalogueId ?? null;
    if (!catalogueId) {
      const existing = await supabase
        .from("catalogues")
        .select("id")
        .eq("organization_id", data.organizationId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (existing.data) catalogueId = existing.data.id;
      else {
        const created = await supabase
          .from("catalogues")
          .insert({
            organization_id: data.organizationId,
            name: "Main catalogue",
            created_by: userId,
          })
          .select("id")
          .single();
        if (created.error) throw new Error(created.error.message);
        catalogueId = created.data.id;
      }
    }

    const row = {
      organization_id: data.organizationId,
      catalogue_id: catalogueId,
      code: data.code?.trim() || null,
      supplier_code: data.supplierCode,
      name: data.name,
      name_ar: data.nameAr ?? null,
      unit: data.unit ?? null,
      brand: data.brand ?? null,
      category: data.category ?? null,
      base_cost: data.baseCost ?? null,
      currency: data.currency,
      incoterm: data.incoterm?.trim() || null,
      landing_cost: data.landingCost ?? null,
      landing_cost_currency:
        data.landingCost != null ? (data.landingCostCurrency ?? data.currency) : null,
      landing_cost_updated_at: data.landingCost != null ? new Date().toISOString() : null,
      is_active: data.isActive,
      created_by: userId,
    };

    const saved = data.productId
      ? await supabase
          .from("catalogue_products")
          .update(row)
          .eq("organization_id", data.organizationId)
          .eq("id", data.productId)
          .select("id, code, supplier_code")
          .single()
      : await supabase
          .from("catalogue_products")
          .insert(row)
          .select("id, code, supplier_code")
          .single();
    if (saved.error) throw new Error(saved.error.message);

    if (data.specs) {
      await supabase.from("product_specifications").delete().eq("product_id", saved.data.id);
      if (data.specs.length > 0) {
        const { error } = await supabase.from("product_specifications").insert(
          data.specs.map((spec) => ({
            organization_id: data.organizationId,
            product_id: saved.data.id,
            spec_key: spec.key,
            spec_value: spec.value,
            unit: spec.unit ?? null,
            normalized_value: spec.value.toLowerCase(),
          })),
        );
        if (error) throw new Error(error.message);
      }
    }

    if (data.stockQuantity !== null && data.stockQuantity !== undefined) {
      const { error } = await supabase.from("stock_positions").upsert(
        {
          organization_id: data.organizationId,
          product_id: saved.data.id,
          warehouse: "main",
          quantity: data.stockQuantity,
          lead_time_days: data.leadTimeDays ?? 0,
        },
        { onConflict: "product_id,warehouse" },
      );
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: data.productId ? "catalogue_product.updated" : "catalogue_product.created",
      objectType: "catalogue_product",
      objectId: saved.data.id,
      isMaterial: true,
      summary: `${saved.data.code ?? saved.data.supplier_code} — ${data.name}`,
    });

    return { product: saved.data };
  });

export const deleteCatalogueProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const { error } = await supabase
      .from("catalogue_products")
      .update({ is_active: false })
      .eq("organization_id", data.organizationId)
      .eq("id", data.productId);
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "catalogue_product.deactivated",
      objectType: "catalogue_product",
      objectId: data.productId,
      isMaterial: true,
    });

    return { ok: true };
  });
