# Phase 4 — Pricing Builder, Commercial Review & Quotation

Do not build features beyond what's written here. Phases 5–6 stay documented-only — nothing in this doc authorizes touching AI proposal writing, PDF export, or any catalogue-advanced-features track.

## Goal

Take a tender that has cleared Portfolio Match (stage `product`) and Supply Route (stage `sourcing`) — every BOQ line now has a confirmed product or a confirmed sourcing route with a cost — and turn it into a released, client-facing quotation with a governed sign-off chain. This is the only phase left that the original roadmap scoped in detail; everything after it is roadmap-only until formally planned.

## Why this shape, not a guess

The calculation methodology and the approval chain below aren't invented — they're read directly off the user's own company's real tender cost sheet (Behzad Medical Est., Bahrain) and the governance infrastructure already sitting built-but-unused in this codebase:

- **`tender_stage` enum already has `commercial`, `finance`, `release`** as stages 5–7 of 7, seeded with real approver roles (`commercial_manager`, `finance_manager`, `signatory`) since Phase 1. Nothing currently submits or decides against them.
- **`NEXT_STAGE` in `portfolio-map.ts` stops at `commercial`** — `{ technical: "product", product: "sourcing", sourcing: "commercial" }`. The map for what happens *after* commercial approval doesn't exist yet. That's the actual gap.
- **`decideStageApproval` in `portfolio.functions.ts` is already fully generic** — stage, approver_role, self-approval block, audit write, `NEXT_STAGE` advance, all data-driven off `approval_tasks`. It needs zero changes to work for `commercial`/`finance`/`release` — it already will, the moment something submits a task against those stages.
- **The real cost sheet's column order *is* the calculation methodology**: Incoterm → foreign price → FX rate → freight → customs → **landing cost** → margin % → **unit price** → **total price**, with an HS Code column driving customs. Margin is applied on landing cost (markup), not on selling price — confirmed from the sheet, not assumed.
- **The real sign-off block on that sheet** (Product Specialist → Service Manager → Logistics Specialist → Sales Manager → Logistics Manager → COO) is a real multi-stage chain, which is why this phase does *not* collapse commercial/finance/release into one rubber-stamp step.

## What the user gets

### Screen 05 — Pricing builder (`/workbench/pricing`)

Replaces the current placeholder. One row per BOQ item that has a confirmed match or route from Phases 3–4:

- **Cost basis, pulled automatically, never re-entered**: ex-stock items read `catalogue_products.landing_cost` (+ `landing_cost_currency`); every other route reads the accepted `supplier_quotes.unit_cost` (+ `currency`). If neither exists yet (route confirmed but no cost captured), the row is blocked with a named reason — same "AI/system suggests, human confirms, nothing invented" rule as every prior phase.
- **Margin %, with an explicit basis** — a per-line (or org-wide default, overridable per line) percentage, stored with `margin_basis = 'cost'` fixed for this phase (matches the real sheet; margin-on-price is deferred, see Out of scope).
- **Computed, not typed**: `unit_price = cost_basis × (1 + margin_percent / 100)`, `total_price = unit_price × quantity`. All arithmetic through `Decimal.js` — no raw float touches a money value, consistent with `format.ts`.
- Submitting moves the tender to stage `commercial`.

### Screen 06 — Commercial review & quotation (`/workbench/review`)

Replaces the current placeholder. Renders whichever of the three remaining stages is currently active on the tender, reusing the exact submit/approve panel pattern from Screens 3–4:

- **`commercial`** (approver: `commercial_manager`) — reviews the priced lines from Screen 05 against the same self-approval-blocked `decideStageApproval` everyone else uses.
- **`finance`** (approver: `finance_manager`) — reviews the commercial terms that don't belong to a single BOQ line: VAT treatment (per the HS-code-driven VAT design from the catalogue work), payment terms, discount thresholds if any were applied.
- **`release`** (approver: `signatory`) — the final sign-off. Approving it generates the quotation record (see below), sets `status = 'released'`, and is the terminal state this phase produces. PDF/Word export is Phase 5 (AI proposal writing / PDF export) — out of scope here; release in this phase means a released, numbered, database-held quotation, viewable and exportable to the existing screen only.

## Currency

Every cost source is already independently multi-currency (`catalogue_products.currency`, `landing_cost_currency`, `supplier_quotes.currency`) — that part needed no new work. What's new: the **quotation itself** carries one chosen currency, independent of `tenders.currency` (which stays the internal working/costing currency). Each line converts directly from its own native currency to the quotation currency — one FX hop, not chained conversions, to avoid compounding rounding. The rate(s) used are frozen onto the quotation at generation time; a quotation never silently re-prices itself because a rate moved after release.

**Open, needs your confirmation before Screen 06's currency selector is built:** does the person preparing a quotation pick its currency per quotation (a real commercial decision, becomes part of the released document — my assumption below), or is this a personal display preference that doesn't change what the client is actually billed in? The schema below supports either; it only changes whether the selector is "choose for this quotation" or "defaults to your saved preference." Building against the first assumption unless told otherwise.

## Data model (new tables, org-scoped, RLS + GRANTs, matching every existing table's pattern exactly)

```sql
-- Role-check functions, mirroring can_decide_match / can_decide_sourcing exactly
can_decide_pricing(_org)  -- org_admin, proposal_engineer, commercial_manager
can_decide_finance(_org)  -- org_admin, finance_manager
can_release_quotation(_org) -- org_admin, signatory

pricing_lines
  id, organization_id, tender_id, boq_item_id (FK, unique per tender+item),
  cost_basis numeric(18,4), cost_basis_currency text, cost_basis_source text  -- 'landing_cost' | 'supplier_quote'
  margin_percent numeric(7,4), margin_basis text default 'cost',
  unit_price numeric(18,4), unit_price_currency text, total_price numeric(18,4),
  decided_by, decided_at, version, created_by, created_at, updated_at

quotations
  id, organization_id, tender_id, quotation_number text (from company_settings.quotation_number_pattern),
  currency text, fx_rates jsonb,  -- {"EUR": "0.0123", "USD": "..."} snapshot at generation time
  subtotal numeric(18,4), vat_amount numeric(18,4), total numeric(18,4),
  valid_until date (from company_settings.quotation_validity_days),
  status text default 'draft',  -- 'draft' | 'released'
  released_by, released_at, version, created_by, created_at, updated_at

quotation_lines
  id, organization_id, quotation_id (FK), boq_item_id (FK), pricing_line_id (FK),
  description, description_ar, unit, quantity numeric, unit_price numeric(18,4), total_price numeric(18,4),
  sort_order int
```

RLS: read = `is_org_member` (same as every other Phase 1–3 table); write = the matching `can_decide_*`/`can_release_quotation` function per table, same shape as `catalogue_products`' own policies.

## Server functions (new file: `src/lib/pricing.functions.ts`)

- `getPricingBoard` — mirrors `getPortfolioBoard`/`getSourcingBoard` exactly: tender + boq_items + existing pricing_lines + active approval task + my role.
- `savePricingLine` — Zod-validated, optimistic concurrency (`version`), writes audit, recomputes `unit_price`/`total_price` server-side (never trusts a client-computed number).
- `submitPricingForApproval` — same gate pattern as `submitPortfolioForApproval`: every eligible BOQ line needs a saved pricing line before submit succeeds. Advances stage to `commercial`.
- `decideStageApproval` — **reused as-is, zero changes**, for `commercial`, `finance`, and `release`.
- `generateQuotation` — runs on `release` approval: snapshots FX rates, computes subtotal/VAT/total, assigns the numbered `quotation_number`, writes `quotation_lines` from `pricing_lines`, sets `status = 'released'`.
- Extend `NEXT_STAGE` in `portfolio-map.ts`: add `commercial: "finance"`, `finance: "release"`.

## UI rules (unchanged from every prior phase — not new rules, restated so nothing drifts)

- `t()` for every string, English + Arabic, `ar: typeof en` keeps the compiler enforcing parity.
- `text-start`, not `text-left`; wide tables inside the existing `<TableScroll>`.
- Money via `formatMoney` (now currency-correct after the BHD fix), never string concatenation.
- No hardcoded English, no invented values, no auto-confirm — every number on Screen 05 traces back to a stored cost source or a human-entered margin.

## Tests and gates

- Unit: `Decimal.js` margin/total math (cost-basis rounding, currency conversion, zero-cost-basis guard).
- Unit: `NEXT_STAGE` extension.
- RLS: anonymous-denied suite extended to the three new tables (same pattern as `tenancy.rls.test.ts`).
- Governance: self-approval still blocked on `commercial`/`finance`/`release` (already proven generic, but must be demonstrated, not assumed).
- Browser: full walk — Screen 05 submit → `commercial` approve → `finance` approve → `release` approve → `quotations` row exists with correct number, currency, and frozen FX rate.
- Visual QA EN/AR, same overflow/clipping checks as every prior phase's audit.

## Out of scope for this phase (explicitly deferred, not silently dropped)

- Margin-on-selling-price as an alternative basis (only margin-on-cost, matching the real sheet, ships now).
- PDF/Word quotation export — Phase 5.
- Live/API-sourced FX rates — manual entry only this phase; a rate-lookup integration is a later enhancement, not blocking release.
- A personal per-user currency display preference, if that's what "user preference" turns out to mean instead of per-quotation choice (see Currency section) — the schema doesn't block adding this later either way.
- Any catalogue-track item (HS codes/VAT screen, supplier price lists, OneDrive sync) — separate initiative, not this phase, even though VAT is referenced above as an input finance reviews.
