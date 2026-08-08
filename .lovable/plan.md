# TenderReady — Architecture & Phased Delivery Plan

## Two stack corrections up front

1. **Server logic uses TanStack Start server functions, not Supabase Edge Functions.** This project runs on TanStack Start (React 19 + Vite 7, SSR on Cloudflare Workers). App-internal server logic (ingestion, AI, pricing, approvals, exports) is written as `createServerFn` handlers with auth middleware; only true external callers (webhooks, cron) get `/api/public/*` routes. Same security properties, same secrets model — different file shape than "Edge Functions".
2. **Backend is Lovable Cloud** (managed Postgres + Auth + private Storage + RLS + migrations). Migrations are files in the repo, so schema is tracked, not dashboard-only.

Everything else in your contract is taken as required product behavior.

## Route map

| Route | Screen | Notes |
|---|---|---|
| `/auth`, `/reset-password` | — | public; email+password and Google |
| `/_authenticated/dashboard` | portfolio | tenders, alerts, gate load |
| `/_authenticated/tenders/new` | 01 | create tender |
| `/_authenticated/tenders/$id/intake` | 01 | uploads, validation, readiness, data boundary |
| `/_authenticated/tenders/$id/requirements` | 02 | register, provenance, exceptions |
| `/_authenticated/tenders/$id/portfolio-match` | 03 | hard gates, score, decision |
| `/_authenticated/tenders/$id/sourcing` | 04 | 4 route branches, quotes |
| `/_authenticated/tenders/$id/pricing` | 05 | factor engine, margin cockpit |
| `/_authenticated/tenders/$id/commercial-review` | 06 | read-only checker view, Gate 05 |
| `/_authenticated/approvals` | 07 | functional inbox (analytics flagged) |
| `/_authenticated/admin/workflows` | 08 | read-only seeded config (editor flagged) |
| `/_authenticated/settings/{company,users,catalogues,quotation-template}` | — | admin |
| `/` | — | public landing → sign-in |

Shell components: `WorkspaceSidebar`, `TenderHeaderStrip` (client/location/area + EN\|AR + evidence chip + counter), `GuidedStepper`, `RoleBadge`, `StickyActionBar`, `SourceDrawer`, `AuditDrawer`, `EvidenceStrip`, `StatusPill`, `ConfidenceMeter`, `ExceptionQueue`, `BoundedTable` (sticky header + pinned key columns + internal scroll), `FactorRow`, `MarginCockpit`, `GateDecisionPanel`, `DemoRoleSwitcher` (dev-only).

## Data model (ERD, grouped)

Every tenant table: `id uuid pk`, `organization_id`, `created_at`, `updated_at`, `created_by`, and `version int` where materially edited. Money is `numeric(18,4)`.

- **Identity/tenancy** — `profiles`, `organizations`, `organization_memberships(role,status)`, `user_roles`, `company_settings`, `feature_flags`.
- **Tender control** — `clients`, `tenders`, `tender_members`, `tender_files`, `document_versions(sha256, version_order, supersedes_id, addendum_of_id, processing_status)`, `extraction_jobs(status: queued|running|completed|failed|integration_required, idempotency_key)`, `source_references(document_version_id, sheet_name, sheet_order, page, row_number, cell_ref, range_ref, original_excerpt, locator jsonb)`.
- **Technical** — `boq_items(parent_id, item_code, description_en/ar, unit, quantity, rate, amount, remarks, division, system, is_subtotal, is_rate_only, blank_price, exception_flags[], confidence, source_reference_id)`, `requirements(category, criticality, compliance_state, owner_id, confidence, source_reference_id, override_reason, override_by)`, `clarifications`, `deliverables`, `comments`, `attachments`, `raw_extractions` (raw JSON kept separate from normalized rows).
- **Portfolio/sourcing** — `catalogues`, `catalogue_products`, `product_specifications`, `stock_positions`, `portfolio_matches(score, hard_gate_results jsonb, evidence jsonb, ai_explanation, maker_id, checker_id, decision)`, `suppliers`, `supplier_quotes(currency, incoterm, lead_time_days, valid_until, attachment_id)`, `sourcing_routes(route_type: company_exstock|company_import|outside_local|outside_foreign, approval_state)`.
- **Commercial** — `pricing_versions`, `pricing_lines`, `cost_factors(value_type: fixed|percentage, value, currency, percentage_basis, sort_order, source_reference_id)`, `fx_snapshots(pair, rate, source, captured_at, approved_by)`, `commercial_policies`, `quotation_templates`, `quotations`, `quotation_versions`, `exports(manifest jsonb, checksum)`.
- **Governance** — `workflow_templates`, `workflow_stages`, `workflow_instances`, `approval_tasks`, `approval_decisions`, `notifications`, append-only `audit_events`, `ai_runs(purpose, provider, model, prompt_version, input_ids, result_status, citations, tokens, cost, latency_ms, reviewer_outcome)`.

Unique constraints: `(organization_id,user_id)` membership; `(tender_id,sha256)` file hash; partial unique active `approval_tasks(object_type,object_id,stage)`; `(organization_id,quotation_number)`. Indexes on every FK plus `(organization_id, status)` hot paths.

Migration sequence: 01 enums+`profiles`/orgs/memberships/roles/`has_role`/`is_org_member` + audit → 02 clients/tenders/members/files/document_versions/extraction_jobs/source_references + storage bucket & policies → 03 boq_items/requirements/clarifications/deliverables/comments → 04 catalogues/products/specs/stock/matches/suppliers/quotes/routes → 05 pricing/cost_factors/fx/policies/templates/quotations/exports → 06 workflow/approval/notifications/ai_runs/feature_flags → 07 seed (org, users, sanitized Elevate Gym tender, catalogue, matches, routes, quotes, FX, factors, tasks, template).

## Authorization

Security-definer helpers: `is_org_member(org)`, `has_org_role(org, role)`, `is_tender_member(tender)`, `can_edit_object(object, stage)`. All policies call these — never a subquery on the policy's own table.

| Role | Read org | Intake edit | Requirements | Match | Sourcing | Pricing edit | Approve |
|---|---|---|---|---|---|---|---|
| Org Admin | ✓ | — | — | — | — | — | settings only, no override |
| Proposal Engineer (Maker) | ✓ | ✓ | ✓ draft | propose | propose | ✓ | never own object |
| Technical Lead | ✓ | — | ✓ review | — | — | — | Gate 02 |
| Product Manager | ✓ | — | — | ✓ | — | — | Gate 03 |
| Sourcing Manager | ✓ | — | — | — | ✓ | — | Gate 04 |
| Commercial Manager | ✓ | — | — | — | — | — | Gate 05 |
| Finance Manager | ✓ | — | — | — | — | FX/tax | Gate 06 |
| GM / Signatory | ✓ | — | — | — | — | — | Gate 07 release |
| Viewer / Auditor | ✓ | — | — | — | — | — | none |

RLS on every table (`organization_id` scoped, role-gated writes) plus `storage.objects` policies keyed on org path prefix; uploads restricted by MIME allowlist, size cap, sanitized filename, SHA-256 verification, access only via signed URLs. `organization_id` from the browser is never trusted — resolved from the caller's active membership server-side. Rate limits (per user+endpoint token bucket in Postgres) on ingestion, AI, export, and approval endpoints.

## Approval state machine (server-side)

States: `draft → submitted → in_review → {approved | changes_requested | rejected}`, plus `superseded`, `released`. Gates: Intake → Technical → Product → Sourcing → Commercial → Finance → Release, sequential by default.

`decide_approval(task_id, decision, note, object_version)` runs in one transaction and: locks the task; rejects if `object_version` is stale (optimistic concurrency); rejects if the actor created or materially edited the object per `audit_events` (maker-checker, enforced in SQL, not React); requires a note for `request_changes`/`reject`/override; writes `approval_decisions` + `audit_events`; advances the workflow instance; evaluates escalation conditions (margin < policy, foreign sourcing, missing critical evidence, expired quote, changed FX) and inserts extra required approvers or blocks release. Idempotency key per (task, actor, decision).

`invalidate_downstream(object, reason)` fires on material edits (cost, quantity, FX, route, target margin) — creates a new object/pricing version and invalidates only Commercial/Finance/Release tasks, recording the reason. Upstream approved evidence stays valid.

## Server functions (inputs → outputs, auth, idempotency)

All authenticated via `requireSupabaseAuth`; all validate with Zod; all return typed DTOs; all mutating functions take an idempotency key and log a correlation ID.

`createTender`, `requestUploadUrl`, `registerDocumentVersion` (hash dedupe → warns), `startExtraction` (queues job, idempotent per file hash+version), `getExtractionStatus`, `normalizeExtraction`, `listRequirements`, `updateRequirement` (versioned), `overrideRequirementSource` (reason required), `resolveException`, `getSourceLocator`, `importCatalogue`, `runPortfolioMatch` (deterministic hard gates then weighted score), `decidePortfolioMatch`, `setSourcingRoute`, `recordSupplierQuote`, `createPricingVersion`, `upsertCostFactor`, `computePricing` (pure Decimal engine, no persistence), `captureFxSnapshot` (Finance-approved), `submitForApproval`, `decideApproval`, `previewQuotation`, `releaseQuotation` (GM only, all gates green), `generateExport` (+ manifest & checksum), `runAiTask` (purpose-scoped), `listAuditEvents`. Public routes: `/api/public/webhooks/*` (signature-verified), `/api/public/cron/quote-expiry`.

## Pricing engine

Ordered deterministic factor pipeline over Decimal.js; each factor is `fixed` or `percentage` with an explicit basis (base cost, running landed subtotal, or selling price), basis graph checked acyclic before evaluation. `base_cost_egp = foreign_unit_cost × approved_fx_rate`. `selling_price_before_tax = landed_cost / (1 − target_margin_rate)`; margin and markup are separately stored, labelled, and tested. Central currency rounding module. Blank source prices stay blank — no AI, no defaulting. Every step is shown in a transparent breakdown with the dated FX snapshot and quote validity.

## AI and evidence

Server-only, structured JSON validated by Zod before persistence, via Lovable AI (default `google/gemini-3.6-flash`). Tasks: requirement classification, EN/AR normalization, exception detection, match explanation, clarification drafting, source-linked proposal sections. Every claim cites stored `source_references`; uncited output is blocked or `needs_review`. AI may explain but never override a failed hard gate, never fill blank prices, never invent suppliers or compliance claims. Three visibly separate context layers: approved tender facts, approved company knowledge, approved strategy. Internal cost/margin/supplier notes are never sent into client-facing generation. Every call recorded in `ai_runs`.

**Secrets:** Lovable AI needs none (provisioned). OCR/document intelligence for PDF/DOCX/scanned files needs a provider secret you supply — until then those uploads surface `Integration required` and nothing is fabricated. I will request it when Phase 2 reaches PDF ingestion, and will not claim any integration works without a configured secret and a passing test.

## Design system

Tokens in `src/styles.css` (oklch): navy `#061A3D`, dark navy `#0B2855`, ink `#12203A`, teal `#009B93`, blue `#1253C6`, gold `#D99A00`, bg `#F4F7FA`, border `#E2E8F0`, muted `#687386`, green `#119C67`, red `#D3465B`, purple `#6D5BD0`; radii 12–16px, restrained shadows. Inter (EN) + Cairo (AR) via root `<link>`. i18next with `dir` flip at app root, state preserved across switch; numbers, formulas, part numbers, currency, emails, and cell refs never mirrored. Uploaded 08B logo as a Lovable asset; square favicon in `public/`.

## Phases (one at a time — migrate, seed, test, pin)

1. **Foundation** — Cloud, design shell, routing, tokens, i18n, Auth, orgs/memberships/roles, RLS, private storage, migrations 01, seed users, audit foundation, demo role switcher behind `VITE_DEMO_MODE`.
2. **Intake & evidence** — tender creation, uploads with hash dedupe, async XLSX ingestion of the real Elevate Gym workbook (sheets, divisions, rows, cell refs, merged headers, formula vs displayed, subtotals, remarks, blank prices, rate-only), multi-sheet navigator, normalized BOQ/requirements, source drawer, exceptions, technical review.
3. **Portfolio & sourcing** — catalogue import, hard gates + weighted score, evidence comparison, 4-way route branching, supplier quotes, sourcing approval.
4. **Commercial & governance** — Decimal pricing engine, factor versioning, approval state machine, approval inbox, quotation preview/release.
5. **AI & exports** — structured AI functions with citations, proposal sections, PDF/DOCX/XLSX exports with manifests.
6. **Hardening** — tests, RLS/security audit, performance, observability, a11y, Arabic RTL QA, failure recovery, deployment checklist.

Each phase ends with typecheck, lint, unit tests, migration check, production build, then a report of migrations applied, tables/functions/policies added, routes completed, test results, remaining risks, and the next phase.

## Tests

SQL/RLS tests for cross-org isolation and self-approval blocking; server-function tests for the 14 acceptance criteria (notably: direct-API maker self-approval rejected, unsourced critical requirement blocked without a stored override reason, blank prices stay blank, fixed vs percentage and margin vs markup arithmetic, versioning invalidates only downstream gates, escalation triggers, quotation contains no internal data); Playwright flows for the full pilot path and EN/AR state preservation; automated overflow assertions at 1920×1080, 1440×900, 1024×768 in both directions (`scrollWidth` bounded except inside declared scroll regions), plus screenshot review and repair per route.

## Deferred (explicit)

Screen 07 SLA analytics and delegation intelligence, Screen 08 drag-and-drop versioned workflow editing (seeded read-only config in MVP), Realtime presence, email/SMS notification delivery, OCR for scanned PDFs until a provider secret exists, mobile authoring (mobile is read-only/approval-friendly), and Arabic machine translation of tender content (canonical data stored once).

## Risks

Real-workbook shape variance is the main ingestion risk (mitigated by keeping raw extraction separate and routing anything uncertain to the exception queue); circular percentage bases (mitigated by acyclic basis validation); Worker runtime limits on large XLSX parsing (mitigated by chunked async jobs with retry); RTL table density (mitigated by the bounded-table primitive and per-phase visual QA).
