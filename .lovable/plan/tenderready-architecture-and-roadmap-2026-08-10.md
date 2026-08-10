# TenderReady — Architecture & Roadmap (as-built, 2026-08-10)

Supersedes the phase-status section of `tenderready-architecture-roadmap-and-phase-1-plan-2026-08-08.md` — that doc's Phase 1 architecture is still accurate and not repeated here. This doc reflects what's actually running today, and what's next.

## 1. Architecture overview (as-built)

**Stack**: TanStack Start (React) + Supabase (Postgres, Auth, Storage) + Tailwind. Server functions (`createServerFn`) are the only write path; every table is RLS-gated, so a client-supplied `organizationId` is never a trust boundary — RLS is.

**Route map (built)**:
```
/dashboard
/workbench/intake        — Phase 2
/workbench/requirements  — Phase 2
/workbench/portfolio     — Phase 3
/workbench/sourcing      — Phase 3
/workbench/pricing       — placeholder (Phase 4, planned — see its own doc)
/workbench/review        — placeholder (Phase 4, planned — see its own doc)
/settings/catalogue       — catalogue upgrade (this session, see §3)
/settings/company, /settings/users, /admin/workflows, /approvals, /audit — Phase 1
```

**Governed flow (7 stages, all seeded since Phase 1, only 4 currently wired to a screen)**:

| # | Stage | Approver role | Screen | Status |
|---|---|---|---|---|
| 1 | intake | proposal_engineer | Tender intake | Built |
| 2 | technical | technical_lead | BOQ & requirements | Built |
| 3 | product | product_manager | Portfolio match | Built |
| 4 | sourcing | sourcing_manager | Supply route | Built |
| 5 | commercial | commercial_manager | Pricing builder | Planned (Phase 4) |
| 6 | finance | finance_manager | Commercial review & quotation | Planned (Phase 4) |
| 7 | release | signatory | Commercial review & quotation | Planned (Phase 4) |

The mechanism (`approval_tasks`, `decideStageApproval`, self-approval block, `NEXT_STAGE` advance) is stage-agnostic and already proven across stages 1–4. Stages 5–7 need submissions wired to them, not a new mechanism.

**Data model (ERD groups, as-built)**:
- **Tenancy**: `organizations`, `organization_memberships`, `profiles`, `company_settings`.
- **Tender core**: `tenders`, `clients`, `boq_items`, `requirements`, `extraction_jobs`, `extraction_exceptions`, `source_references`, `document_versions`, `tender_files`.
- **Governance**: `workflow_templates`, `workflow_stages` (seeded 7-stage chain), `approval_tasks`, `approval_decisions`, `audit_events` (append-only).
- **Catalogue** (extended this session, see §3): `catalogues`, `catalogue_products` (now with `supplier_code`, `code`/Icode, `incoterm`, `landing_cost`), `product_specifications`, `stock_positions`.
- **Matching & sourcing (Phase 3)**: `portfolio_matches`, `sourcing_routes`, `suppliers`, `supplier_quotes`.
- **Catalogue import (this session, Lovable-owned schema)**: `catalogue_import_batches`, `catalogue_import_rows` (JSONB `raw_data`/`mapped_data`).
- **Not yet built**: `pricing_lines`, `quotations`, `quotation_lines` — see the Phase 4 plan doc.

**Role/RLS pattern**: every write-gated table follows the same shape — a `SECURITY DEFINER` `can_decide_*`/`can_manage_*` function checking `has_any_org_role`, referenced from that table's own RLS policy. New tables should extend this pattern, not invent a new one (the one real defect found this session — the catalogue-import tables briefly only checking org membership instead of a role — was a deviation from this pattern, since fixed).

**Money discipline**: every numeric money value is a Postgres `numeric`, parsed through `Decimal.js` (`format.ts`), formatted through `Intl.NumberFormat` with the currency's own real decimal precision (fixed this session — previously hardcoded to 2, which silently mis-rounded 3-decimal currencies like BHD).

## 2. Phases 1–3 — built, audited, in active use

Each has its own detailed plan doc (`phase-1-...`, `phase-2-...`, `phase-3-...`) — not repeated here. Status: all three passed multiple audit rounds this session (typecheck, lint, RLS, build, browser/visual QA in English and Arabic) with defects found and fixed along the way (money-formatting bug, critical-item gate verified, RLS gap on catalogue-import tables).

## 3. Catalogue upgrade — built this session, not on the original 5-phase roadmap

This was scoped and built mid-session, in parallel with (and partly independently duplicated by) Lovable's own agent working the same request. Reconciled onto Lovable's live schema as the single source of truth per an explicit decision during that reconciliation. Delivered:

- **Icode vs. supplier code**: `catalogue_products.code` (internal, assigned only once a SKU is enlisted/active) split from `supplier_code` (present on every SKU, active or not).
- **Supplier price vs. landing cost**: raw supplier price (any SKU) split from computed landing cost (ex-stock only — supplier price × FX + freight + duty).
- **Multi-format import pipeline**: upload Excel/CSV (read deterministically) or PDF/Word/photo (read via a catalogue-specific AI extraction prompt, `LOVABLE_API_KEY`-gated) → review extracted rows with confidence + match hints → commit as inactive SKUs, matched to existing products by either code, never overwriting descriptive fields (name/brand/category/unit) on an update.
- **Storage**: `catalogue-files` bucket, RLS scoped to catalogue managers.

**Documented but not built**: HS codes & VAT (per-code duty + per-country VAT, referenced as a Phase 4 finance-stage input but not implemented), supplier price-list matching as its own screen, OneDrive/Google Sheets live sync for landing cost & stock (needs an account-level OAuth registration only the user can create).

## 4. Phase 4 — planned in detail

See `phase-4-pricing-commercial-review-and-quotation-2026-08-10.md`. Summary: Pricing Builder (Screen 5) computes selling price per BOQ line from the existing landing-cost/supplier-quote cost basis plus an explicit-basis margin %; Commercial Review & Quotation (Screen 6) walks the `commercial → finance → release` stages already seeded since Phase 1, and release generates a numbered, currency-converted, FX-rate-frozen quotation. Grounded in the user's own company's real tender cost sheet (calculation methodology and approval chain both read from it, not assumed).

## 5. Phase 5 — documented roadmap only, not implemented

AI proposal writing and PDF/document export, per the original roadmap. No schema, no screens, no server functions exist for this. Do not build against this section — it is a placeholder for scoping, not a spec.

## 6. Phase 6 — reserved, undefined

Explicitly put on hold pending the user's decision on what it contains. Do not infer scope for it (an earlier attempt to guess between "catalogue advanced features" and "AI proposal writing, renumbered" was both rejected). Nothing should be built against a Phase 6 label until it has its own scoping conversation.

## 7. Risks

- **Parallel build risk is real and already happened once**: Lovable's own agent independently built a conflicting version of the catalogue-import schema in parallel with this session's work, discovered only after both were pushed. Before starting Phase 4 implementation, `git fetch` and diff against `origin/main` first — this doc's "not yet built" claims are only as fresh as the last check.
- **Local `.env` vs. Lovable-hosted environment drift**: `LOVABLE_API_KEY` is provisioned in Lovable's own hosted runtime but not in this local dev checkout — AI-path features (PDF/photo catalogue import, and any future AI proposal work in Phase 5) behave differently locally vs. on Lovable's preview URL. Know which one you're testing against.
- **Currency-preference ambiguity** (Phase 4, see its own doc) is still open and could reshape Screen 6's currency selector if answered differently than assumed.

## 8. Deferred / blocked scope

- Two-org cross-tenant RLS probe — needs a second real org + user; paused pending the user's decision on creating one.
- Full submit→approve cycle demonstrated live on the real "Elevate Gym" tender — blocked on deciding all 290 real BOQ lines, paused pending the user's decision (mass-mutating real data).
- `runPortfolioMatch` sanity check against the seeded catalogue — not yet executed.
