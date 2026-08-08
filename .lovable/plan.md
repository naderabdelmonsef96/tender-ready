# Phase 3 — Portfolio Match and Supply Route

Phase 1 (foundation) and Phase 2 (intake, extraction, requirements register) stay untouched and keep passing. This plan covers only Screen 03 (Portfolio Match) and Screen 04 (Supply Route). Phases 4–6 remain roadmap.

## Goal

Every reviewed BOQ item gets a named decision: matched to a company product (ex-stock or import) or routed outside the portfolio (local supplier or foreign RFQ). Matching is assistive and evidence-backed; a human owns each decision, and Product Manager / Sourcing Manager approvals gate the stage.

## What the user gets

### Screen 03 — Portfolio Match
- Left: the tender's reviewed BOQ items with match state (unmatched / suggested / confirmed / out of portfolio), confidence, and criticality.
- Right: candidate products for the selected item — each with the reason it matched (spec fields that passed, fields that failed), unit, and stock position.
- Actions: confirm a candidate, pick a different product from the catalogue search, mark out of portfolio (reason required), or request clarification.
- A critical item cannot be confirmed without either a matched specification reference or a named override with a written reason.
- Panel footer: coverage counters (confirmed / suggested / unmatched) and "Submit portfolio match for approval".

### Screen 04 — Supply Route
- For each decided item, a branch selector:
  - In-portfolio → **ex-stock** (shows available stock, warehouse, lead time) or **import** (supplier, origin country, incoterm, lead time).
  - Out of portfolio → **local supplier** or **foreign RFQ**, each opening a supplier-quote record (supplier, currency, unit cost, validity, attachment reference).
- Route summary strip: counts per route, longest lead time, items still missing a route, quotes expiring before the tender deadline.
- Footer: "Submit supply route for approval" (Sourcing Manager).

### Catalogue admin
- `/settings/catalogues`: list catalogue products, spec fields, and stock positions; CSV/XLSX import of the product catalogue with the same provenance/exception treatment used for BOQ files; org-admin or product-manager only.

## Data model (new tables, all org-scoped with RLS + GRANTs)

- `catalogues`, `catalogue_products` (code, name EN/AR, unit, brand, category, base cost, currency, active)
- `product_specifications` (product, key, value, unit, normalized value)
- `stock_positions` (product, warehouse, quantity, lead_time_days)
- `portfolio_matches` (boq_item, product, state, score, matched_on jsonb, failed_on jsonb, decided_by, decided_at, override_reason, version)
- `suppliers` (name, country, kind local|foreign, contact)
- `supplier_quotes` (tender, boq_item, supplier, currency, unit_cost, valid_until, incoterm, lead_time_days, note, created_by)
- `sourcing_routes` (boq_item, route ex_stock|import|local_supplier|foreign_rfq, product or supplier_quote reference, lead_time_days, decided_by, version)

Constraints: one active `portfolio_matches` row per BOQ item, one active `sourcing_routes` row per BOQ item, money as `numeric(18,4)`, `updated_at` triggers, and append-only `audit_events` entries for every material decision.

## Matching engine (server-side, deterministic first)

1. **Hard gates** — unit compatibility, category, and any mandatory spec key present in the requirement text. Failing a gate excludes the product; it is never softened by score.
2. **Weighted score** — normalized description similarity, spec-key agreement, brand/standard mentions, historical usage. Score is advisory only and shown as a confidence meter with the matched/failed fields listed.
3. Items with no candidate above the floor stay `unmatched` and appear in the exception counters. Nothing is auto-confirmed, and no spec, brand, or price is invented.

## Server functions (`src/lib/portfolio.functions.ts`, `src/lib/sourcing.functions.ts`)

`listCatalogueProducts`, `importCatalogue`, `runPortfolioMatch` (idempotency key), `decideMatch`, `clearMatch`, `submitPortfolioForApproval`, `listSourcingBoard`, `setSourcingRoute`, `saveSupplierQuote`, `submitSourcingForApproval`.

Every mutation: Zod input, membership + role check server-side, org id derived from verified membership (never trusted from the browser), version check for optimistic concurrency, audit event, and downstream approval invalidation on material change.

## Governance

- Product Manager approves portfolio match; Sourcing Manager approves supply route.
- No one may approve an object they created or materially edited — enforced in the server function, not just the UI.
- Editing a confirmed match invalidates only the sourcing/commercial approvals downstream; approved technical evidence upstream stays valid.
- The existing Approval Inbox gains the two new stage task types.

## UI rules

Reuse the approved TenderReady shell, stepper, panels, dense tables, evidence strip, confidence meter, and exception badges. No new palette, no redesign. Full EN/AR strings for every new label, empty state, validation message, and toast; RTL verified. Money and part numbers stay LTR.

## Tests and gates

- Matching engine unit tests: hard gates exclude, scoring order stable, no auto-confirm, Arabic/English description normalization.
- RLS probes: Org A cannot read or write Org B catalogue products, quotes, matches, or routes.
- Server-function tests: non-privileged caller rejected; self-approval rejected; stale version rejected.
- Layout QA at 1920×1080, 1440×900, 1024×768 in EN and AR with a no-horizontal-scroll assertion on both new routes.
- Typecheck, lint, full unit suite, production build.

## Out of scope

Pricing engine and margins, quotation preview/release (Phase 4), AI proposal writing and PDF export (Phase 5), workflow editor drag-and-drop and SLA analytics (behind `roadmap_features`).
