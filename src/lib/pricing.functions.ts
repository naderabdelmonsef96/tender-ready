import { createServerFn } from "@tanstack/react-start";
import Decimal from "decimal.js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthedClient } from "@/lib/intake-db.server";
import { orgTenderSchema, submitStageSchema } from "@/lib/portfolio-schemas";
import { releaseQuotationSchema, savePricingLineSchema } from "@/lib/pricing-schemas";

/** Formats company_settings.quotation_number_pattern — supports {YYYY} and {SEQ:n}. */
function formatQuotationNumber(pattern: string, year: number, seq: number): string {
  return pattern
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{SEQ:(\d+)\}/g, (_m, width) => String(seq).padStart(Number(width), "0"));
}

export const getPricingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tender, items, routes, quotes, lines, tasks, membership, stage] = await Promise.all([
      supabase
        .from("tenders")
        .select(
          "id, reference, title, title_ar, currency, current_stage, stage_state, estimated_value",
        )
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("boq_items")
        .select("id, item_code, description, description_ar, unit, quantity, section_path")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded")
        .order("sheet_index")
        .order("display_order"),
      supabase
        .from("sourcing_routes")
        .select("boq_item_id, route, product_id, supplier_quote_id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("supplier_quotes")
        .select("id, unit_cost, currency")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("pricing_lines")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("approval_tasks")
        .select("id, stage, state, approver_role, submitted_by, submitted_at, invalidated_reason")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .eq("stage", "commercial")
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
        .eq("stage", "commercial")
        .maybeSingle(),
    ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");
    if (items.error) throw new Error(items.error.message);
    if (routes.error) throw new Error(routes.error.message);
    if (quotes.error) throw new Error(quotes.error.message);
    if (lines.error) throw new Error(lines.error.message);

    // Cost basis for ex-stock routes comes from the matched product's landing
    // cost; import routes read that same product's supplier price list entry;
    // every other route reads the accepted supplier quote. Never typed.
    const routeByItem = new Map((routes.data ?? []).map((r) => [r.boq_item_id, r]));
    const quoteById = new Map((quotes.data ?? []).map((q) => [q.id, q]));
    const productIds = (routes.data ?? [])
      .filter((r) => (r.route === "ex_stock" || r.route === "import") && r.product_id)
      .map((r) => r.product_id as string);
    const products =
      productIds.length > 0
        ? await supabase
            .from("catalogue_products")
            .select("id, landing_cost, landing_cost_currency, base_cost, currency")
            .eq("organization_id", data.organizationId)
            .in("id", productIds)
        : { data: [], error: null };
    if (products.error) throw new Error(products.error.message);
    const productById = new Map((products.data ?? []).map((p) => [p.id, p]));

    const activeTask =
      (tasks.data ?? []).find((task) =>
        ["submitted", "in_review", "changes_requested"].includes(task.state),
      ) ?? null;

    return {
      tender: tender.data,
      items: items.data ?? [],
      routes: routes.data ?? [],
      quotes: quotes.data ?? [],
      products: products.data ?? [],
      lines: lines.data ?? [],
      activeTask,
      pricingStage: stage.data ?? null,
      myRole: membership.data?.role ?? null,
      userId,
      // Exposed so the client can render "no route yet" / "route has no cost
      // yet" without re-deriving the same join logic savePricingLine uses.
      unresolvedCostCount: (items.data ?? []).filter((item) => {
        const route = routeByItem.get(item.id);
        if (!route) return true;
        if (route.route === "ex_stock") {
          const product = route.product_id ? productById.get(route.product_id) : null;
          return !product?.landing_cost;
        }
        if (route.route === "import") {
          const product = route.product_id ? productById.get(route.product_id) : null;
          return !product?.base_cost;
        }
        const quote = route.supplier_quote_id ? quoteById.get(route.supplier_quote_id) : null;
        return !quote?.unit_cost;
      }).length,
    };
  });

export const savePricingLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => savePricingLineSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit, invalidateDownstream } = await import("@/lib/intake-db.server");

    const item = await supabase
      .from("boq_items")
      .select("id, tender_id, description, quantity")
      .eq("organization_id", data.organizationId)
      .eq("id", data.boqItemId)
      .maybeSingle();
    if (item.error) throw new Error(item.error.message);
    if (!item.data) throw new Error("BOQ item not found");

    const tender = await supabase
      .from("tenders")
      .select("currency")
      .eq("organization_id", data.organizationId)
      .eq("id", item.data.tender_id)
      .maybeSingle();
    if (tender.error) throw new Error(tender.error.message);

    const qty = item.data.quantity != null ? new Decimal(item.data.quantity) : new Decimal(1);
    const costBasis = new Decimal(data.costBasisAmount);
    const convertedCost = costBasis.times(data.fxRate);
    const freightAmount =
      data.freightMode === "percent"
        ? convertedCost.times(data.freightInput).dividedBy(100)
        : new Decimal(data.freightInput);
    const localAmount =
      data.localMode === "percent"
        ? convertedCost.times(data.localInput).dividedBy(100)
        : new Decimal(data.localInput);
    const landingCost = convertedCost.plus(freightAmount).plus(localAmount);
    const unitPrice = landingCost.dividedBy(new Decimal(1).minus(data.marginPercent / 100));
    const totalPrice = unitPrice.times(qty);
    const landedCurrency =
      data.fxRate === 1
        ? data.costBasisCurrency
        : (tender.data?.currency ?? data.costBasisCurrency);

    const existing = await supabase
      .from("pricing_lines")
      .select("id, version")
      .eq("organization_id", data.organizationId)
      .eq("boq_item_id", data.boqItemId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data && data.version && existing.data.version !== data.version) {
      throw new Error("This line changed since you loaded it. Reload and try again.");
    }

    const patch = {
      organization_id: data.organizationId,
      tender_id: item.data.tender_id,
      boq_item_id: data.boqItemId,
      cost_basis: costBasis.toNumber(),
      cost_basis_currency: data.costBasisCurrency,
      cost_basis_source: data.costBasisSource,
      fx_rate: data.fxRate,
      freight_mode: data.freightMode,
      freight_input: data.freightInput,
      freight_charges: freightAmount.toNumber(),
      local_mode: data.localMode,
      local_input: data.localInput,
      local_charges: localAmount.toNumber(),
      landing_cost: landingCost.toNumber(),
      margin_percent: data.marginPercent,
      taxable: data.taxable,
      vat_percent: data.vatPercent ?? null,
      unit_price: unitPrice.toNumber(),
      unit_price_currency: landedCurrency,
      total_price: totalPrice.toNumber(),
      note: data.note ?? null,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      version: (existing.data?.version ?? 0) + 1,
      created_by: userId,
    };

    const saved = await supabase
      .from("pricing_lines")
      .upsert(patch, { onConflict: "boq_item_id" })
      .select("id, version, unit_price, total_price")
      .single();
    if (saved.error) throw new Error(saved.error.message);

    let invalidatedApprovals = 0;
    if (existing.data) {
      invalidatedApprovals = await invalidateDownstream(supabase, {
        organizationId: data.organizationId,
        tenderId: item.data.tender_id,
        reason: "A priced line changed after submission.",
      });
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "pricing_line.saved",
      objectType: "pricing_line",
      objectId: saved.data.id,
      objectVersion: saved.data.version,
      isMaterial: true,
      summary: data.note ?? item.data.description.slice(0, 160),
    });

    return { line: saved.data, invalidatedApprovals };
  });

export const submitPricingForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const [items, lines, stage] = await Promise.all([
      supabase
        .from("boq_items")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .neq("status", "excluded"),
      supabase
        .from("pricing_lines")
        .select("boq_item_id")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
      supabase
        .from("workflow_stages")
        .select("approver_role")
        .eq("organization_id", data.organizationId)
        .eq("stage", "commercial")
        .maybeSingle(),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (lines.error) throw new Error(lines.error.message);

    const rows = items.data ?? [];
    if (rows.length === 0) throw new Error("There is nothing to price yet.");
    const priced = new Set((lines.data ?? []).map((l) => l.boq_item_id));
    const unpriced = rows.filter((row) => !priced.has(row.id));
    if (unpriced.length > 0) {
      throw new Error(`${unpriced.length} item(s) still have no price. Price every item first.`);
    }

    const task = await supabase
      .from("approval_tasks")
      .insert({
        organization_id: data.organizationId,
        tender_id: data.tenderId,
        stage: "commercial",
        object_type: "pricing_line",
        approver_role: stage.data?.approver_role ?? "commercial_manager",
        state: "submitted",
        submitted_by: userId,
      })
      .select("id, state, approver_role")
      .single();
    if (task.error) throw new Error(task.error.message);

    await supabase
      .from("tenders")
      .update({ current_stage: "commercial", stage_state: "submitted" })
      .eq("organization_id", data.organizationId)
      .eq("id", data.tenderId);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "pricing.submitted",
      objectType: "pricing_line",
      objectId: data.tenderId,
      isMaterial: true,
      summary: data.note ?? `${rows.length} items submitted for commercial approval`,
    });

    return { task: task.data };
  });

/**
 * Finance and release are review checkpoints, not data-entry stages — there's
 * nothing new to fill in, only the already-priced lines to check. Each still
 * needs its own explicit submit (matching how every prior stage works: a
 * stage advancing current_stage never auto-creates the next task).
 */
async function submitReviewStage(
  supabase: AuthedClient,
  userId: string,
  stage: "finance" | "release",
  data: { organizationId: string; tenderId: string; note?: string | null | undefined },
) {
  const { writeAudit } = await import("@/lib/intake-db.server");

  const [existing, stageRow] = await Promise.all([
    supabase
      .from("approval_tasks")
      .select("id, state")
      .eq("organization_id", data.organizationId)
      .eq("tender_id", data.tenderId)
      .eq("stage", stage)
      .in("state", ["submitted", "in_review", "changes_requested"])
      .maybeSingle(),
    supabase
      .from("workflow_stages")
      .select("approver_role")
      .eq("organization_id", data.organizationId)
      .eq("stage", stage)
      .maybeSingle(),
  ]);
  if (existing.data) throw new Error("This stage is already awaiting a decision.");

  const task = await supabase
    .from("approval_tasks")
    .insert({
      organization_id: data.organizationId,
      tender_id: data.tenderId,
      stage,
      object_type: stage === "release" ? "quotation" : "pricing_line",
      approver_role:
        stageRow.data?.approver_role ?? (stage === "finance" ? "finance_manager" : "signatory"),
      state: "submitted",
      submitted_by: userId,
    })
    .select("id, state, approver_role")
    .single();
  if (task.error) throw new Error(task.error.message);

  await supabase
    .from("tenders")
    .update({ current_stage: stage, stage_state: "submitted" })
    .eq("organization_id", data.organizationId)
    .eq("id", data.tenderId);

  await writeAudit(supabase, {
    organizationId: data.organizationId,
    actorId: userId,
    action: `${stage}.submitted`,
    objectType: "approval_task",
    objectId: task.data.id,
    isMaterial: true,
    summary: data.note ?? `Submitted for ${stage} review`,
  });

  return { task: task.data };
}

export const submitFinanceForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitStageSchema.parse(input))
  .handler(({ data, context }) =>
    submitReviewStage(context.supabase, context.userId, "finance", data),
  );

export const submitReleaseForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitStageSchema.parse(input))
  .handler(({ data, context }) =>
    submitReviewStage(context.supabase, context.userId, "release", data),
  );

export const getQuotationBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tender, tasks, quotation, lines, membership, stages] = await Promise.all([
      supabase
        .from("tenders")
        .select("id, reference, title, title_ar, currency, current_stage, stage_state")
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("approval_tasks")
        .select("id, stage, state, approver_role, submitted_by, submitted_at, invalidated_reason")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .in("stage", ["finance", "release"])
        .order("submitted_at", { ascending: false }),
      supabase
        .from("quotations")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("pricing_lines")
        .select(
          "id, boq_item_id, cost_basis_currency, unit_price, unit_price_currency, total_price",
        )
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId),
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
        .in("stage", ["finance", "release"]),
    ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");
    if (tasks.error) throw new Error(tasks.error.message);
    if (quotation.error) throw new Error(quotation.error.message);
    if (lines.error) throw new Error(lines.error.message);

    const activeTask =
      (tasks.data ?? []).find((task) =>
        ["submitted", "in_review", "changes_requested"].includes(task.state),
      ) ?? null;
    const currenciesInUse = Array.from(
      new Set((lines.data ?? []).map((l) => l.unit_price_currency)),
    );

    const quotationLines = quotation.data
      ? await supabase
          .from("quotation_lines")
          .select("id, description, description_ar, unit, quantity, unit_price, total_price")
          .eq("organization_id", data.organizationId)
          .eq("quotation_id", quotation.data.id)
          .order("sort_order")
      : { data: [], error: null };
    if (quotationLines.error) throw new Error(quotationLines.error.message);

    return {
      tender: tender.data,
      activeTask,
      quotation: quotation.data,
      quotationLines: quotationLines.data ?? [],
      lines: lines.data ?? [],
      currenciesInUse,
      stages: stages.data ?? [],
      myRole: membership.data?.role ?? null,
      userId,
    };
  });

export const releaseQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => releaseQuotationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const task = await supabase
      .from("approval_tasks")
      .select("id, tender_id, stage, submitted_by, approver_role, state")
      .eq("organization_id", data.organizationId)
      .eq("id", data.taskId)
      .maybeSingle();
    if (task.error) throw new Error(task.error.message);
    if (!task.data) throw new Error("Approval task not found");
    if (task.data.stage !== "release") {
      throw new Error("Only the release-stage task generates a quotation.");
    }

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

    const [lines, boqItems, settings] = await Promise.all([
      supabase
        .from("pricing_lines")
        .select(
          "id, boq_item_id, unit_price, unit_price_currency, total_price, taxable, vat_percent",
        )
        .eq("organization_id", data.organizationId)
        .eq("tender_id", task.data.tender_id),
      supabase
        .from("boq_items")
        .select("id, description, description_ar, unit, quantity, display_order")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", task.data.tender_id),
      supabase
        .from("company_settings")
        .select("quotation_number_pattern, quotation_validity_days")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
    ]);
    if (lines.error) throw new Error(lines.error.message);
    if (boqItems.error) throw new Error(boqItems.error.message);
    if (!lines.data || lines.data.length === 0) {
      throw new Error("There is nothing priced to release.");
    }

    const boqById = new Map((boqItems.data ?? []).map((b) => [b.id, b]));
    const fxRates = data.fxRates ?? {};
    const convert = (amount: string | number, currency: string): Decimal => {
      const value = new Decimal(amount);
      if (currency === data.currency) return value;
      const rate = fxRates[currency];
      if (!rate) {
        throw new Error(`Missing FX rate from ${currency} to ${data.currency}.`);
      }
      return value.times(rate);
    };

    let subtotal = new Decimal(0);
    let vatAmount = new Decimal(0);
    const quotationLineRows = lines.data.map((line) => {
      const boq = boqById.get(line.boq_item_id);
      const convertedTotal = convert(line.total_price, line.unit_price_currency);
      const convertedUnit = convert(line.unit_price, line.unit_price_currency);
      subtotal = subtotal.plus(convertedTotal);
      // Exempt lines never contribute VAT; a line without its own rate
      // inherits the blanket rate entered on this release.
      if (line.taxable) {
        const rate = line.vat_percent ?? data.vatPercent;
        vatAmount = vatAmount.plus(convertedTotal.times(rate / 100));
      }
      return {
        organization_id: data.organizationId,
        boq_item_id: line.boq_item_id,
        pricing_line_id: line.id,
        description: boq?.description ?? "",
        description_ar: boq?.description_ar ?? null,
        unit: boq?.unit ?? null,
        quantity: boq?.quantity ?? null,
        unit_price: convertedUnit.toNumber(),
        total_price: convertedTotal.toNumber(),
        sort_order: boq?.display_order ?? 0,
      };
    });

    const discount = new Decimal(data.discount ?? 0);
    const otherCharges = new Decimal(data.otherCharges ?? 0);
    const total = subtotal.minus(discount).plus(vatAmount).plus(otherCharges);

    const year = new Date().getFullYear();
    const countThisYear = await supabase
      .from("quotations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .gte("created_at", `${year}-01-01`);
    const pattern = settings.data?.quotation_number_pattern ?? "QT-{YYYY}-{SEQ:4}";
    const quotationNumber = formatQuotationNumber(pattern, year, (countThisYear.count ?? 0) + 1);
    const validityDays = settings.data?.quotation_validity_days ?? 30;
    const validUntil = new Date(Date.now() + validityDays * 86_400_000).toISOString().slice(0, 10);

    const quotation = await supabase
      .from("quotations")
      .insert({
        organization_id: data.organizationId,
        tender_id: task.data.tender_id,
        quotation_number: quotationNumber,
        currency: data.currency,
        fx_rates: fxRates as never,
        subtotal: subtotal.toNumber(),
        discount: discount.toNumber(),
        other_charges: otherCharges.toNumber(),
        vat_amount: vatAmount.toNumber(),
        total: total.toNumber(),
        valid_until: validUntil,
        status: "released",
        released_by: userId,
        released_at: new Date().toISOString(),
        created_by: userId,
        payment_terms: data.paymentTerms ?? null,
        delivery_terms: data.deliveryTerms ?? null,
        warranty: data.warranty ?? null,
        incoterms: data.incoterms ?? null,
        notes_assumptions: data.notesAssumptions ?? null,
      })
      .select("*")
      .single();
    if (quotation.error) throw new Error(quotation.error.message);

    const insertedLines = await supabase
      .from("quotation_lines")
      .insert(quotationLineRows.map((row) => ({ ...row, quotation_id: quotation.data.id })));
    if (insertedLines.error) throw new Error(insertedLines.error.message);

    const updatedTask = await supabase
      .from("approval_tasks")
      .update({ state: "approved" })
      .eq("id", data.taskId)
      .select("id, state")
      .single();
    if (updatedTask.error) throw new Error(updatedTask.error.message);

    const decision = await supabase.from("approval_decisions").insert({
      organization_id: data.organizationId,
      tender_id: task.data.tender_id,
      task_id: data.taskId,
      stage: "release",
      decision: "approved",
      note: data.note ?? null,
      decided_by: userId,
      is_override: isOverride,
    });
    if (decision.error) throw new Error(decision.error.message);

    await supabase
      .from("tenders")
      .update({ stage_state: "approved" })
      .eq("organization_id", data.organizationId)
      .eq("id", task.data.tender_id);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: isOverride ? "quotation.released_override" : "quotation.released",
      objectType: "quotation",
      objectId: quotation.data.id,
      objectVersion: quotation.data.version,
      isMaterial: true,
      summary: isOverride
        ? `ADMIN OVERRIDE: ${data.note} — ${quotationNumber} released — ${data.currency} ${total.toFixed(2)}`
        : `${quotationNumber} released — ${data.currency} ${total.toFixed(2)}`,
    });

    return { quotation: quotation.data };
  });
