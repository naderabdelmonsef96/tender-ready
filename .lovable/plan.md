# TenderReady — Architecture, Roadmap, and Phase 1 Plan

Phase 1 is the only phase to be implemented now. Phases 2–6 stay documented roadmap.

## 1. Architecture Overview

Stack: TanStack Start (React 19 + Vite), strict TypeScript, Tailwind v4 + shadcn/ui, TanStack Query, React Hook Form + Zod, i18next, Decimal.js. Backend: Lovable Cloud (Postgres + Auth + private Storage + RLS + migrations). Server logic uses TanStack `createServerFn` (no Supabase Edge Functions on this stack); webhooks/cron use `src/routes/api/public/*`.

Guiding rules: every business table carries `organization_id`; org membership is verified server-side, never trusted from the browser; approvals and releases run only through authorized server functions inside transactions; money is `numeric(18,4)` in Postgres and Decimal.js in the client; `audit_events` is append-only.

### Route map (target)
```text
/login, /reset-password                     public
/dashboard                                  portfolio + alerts
/tenders/new, /tenders/:id/intake            Screen 01
/tenders/:id/requirements                    Screen 02
/tenders/:id/portfolio-match                 Screen 03
/tenders/:id/sourcing                        Screen 04
/tenders/:id/pricing                         Screen 05
/tenders/:id/commercial-review               Screen 06
/approvals                                   Screen 07 language, MVP queue
/admin/workflows                             seeded read-only (editor behind flag)
/settings/company | users | catalogues | quotation-template
```
All app routes live under the auth-gated `_authenticated` layout; `/` becomes a session-aware entry that redirects to `/dashboard` or `/login`.

### Component map (shared)
AppShell (sidebar, header with EN/AR + org switcher), GuidedStepper, KpiCard, DataTable (bounded scroll, sticky header/first column), SourceBadge + SourceDrawer, EvidenceStrip, ConfidenceMeter, ExceptionBadge, ApprovalPanel, DecisionDialog, AuditDrawer, MoneyCell, EmptyState/ErrorState/SkeletonBlock, RoleGuard.

### Data model (ERD groups)
- Identity/tenancy: `profiles`, `organizations`, `organization_memberships(role,status)`, `company_settings`, `feature_flags`
- Tender control: `clients`, `tenders`, `tender_members`, `tender_files`, `document_versions(sha256, order, supersedes)`, `extraction_jobs`, `source_references(sheet/page,row/cell,excerpt)`
- Technical: `boq_items`, `requirements`, `clarifications`, `deliverables`, `comments`, `attachments`
- Portfolio/sourcing: `catalogues`, `catalogue_products`, `product_specifications`, `stock_positions`, `portfolio_matches`, `suppliers`, `supplier_quotes`, `sourcing_routes`
- Commercial: `pricing_versions`, `pricing_lines`, `cost_factors(value_type, basis, order)`, `fx_snapshots`, `commercial_policies`, `quotation_templates`, `quotations`, `quotation_versions`, `exports`
- Governance: `workflow_templates`, `workflow_stages`, `workflow_instances`, `approval_tasks`, `approval_decisions`, `notifications`, `audit_events`, `ai_runs`

Constraints: unique active membership per (org,user); unique file hash per tender; unique active approval task per (object, stage); unique quotation number per org; `version` column for optimistic concurrency on materially edited records.

### Role / RLS matrix (summary)
Roles: `org_admin`, `proposal_engineer`, `technical_lead`, `product_manager`, `sourcing_manager`, `commercial_manager`, `finance_manager`, `signatory`, `viewer`.

Read: any active member of the org. Write: role + tender assignment + object state + current workflow stage. Approve/release: server functions only, with maker-checker enforced against creator and material-edit audit events. RLS uses security-definer helpers `is_org_member(org)` and `has_org_role(org, role)` to avoid recursion; every table gets explicit GRANTs plus policies; storage bucket `tender-files` is private with org-prefixed paths and signed URLs only.

### State machine
Intake → Technical → Product → Sourcing → Commercial → Finance → Release. States: draft, submitted, in_review, changes_requested, approved, rejected, superseded, released. Material edit → new version + invalidate only downstream approvals with recorded reason. Conditions (low margin, foreign sourcing, expired quote, stale FX, missing critical evidence) add approvers or block release.

### Server function inventory (target, phase-tagged)
Auth/org (P1): `getMyContext`, `listMyOrganizations`, `switchOrganization`, `inviteMember`, `updateMemberRole`, `getCompanySettings`, `updateCompanySettings`, `listFeatureFlags`, `recordAuditEvent`.
Later: `createTender`, `requestUploadUrl`, `startExtraction` (idempotency key), `getExtractionStatus`, `upsertBoqItems`, `runPortfolioMatch`, `decideMatch`, `setSourcingRoute`, `savePricingVersion`, `submitForApproval`, `decideApproval`, `releaseQuotation`, `generateExport`, `aiRun`.
Every mutation: Zod input, membership+role check, idempotency key where retryable, structured log with correlation id (no document content, no secrets).

### Extraction / AI provider plan
XLSX/CSV parsed server-side with a pure-JS parser (Worker-safe). PDF/DOCX/scanned goes through a provider adapter; without a configured secret the UI shows `Integration required` and never fabricates content. AI runs only in server functions with structured JSON output, mandatory citations to `source_references`, and full logging in `ai_runs`. Secrets required later: document-intelligence/OCR key, LOVABLE_API_KEY for AI Gateway.

## 2. Phase 1 — Foundation (implement now)

Goal: a real multi-tenant, bilingual, permission-aware shell with authentication, tenancy schema, RLS, private storage, seed data, and audit foundation. No tender ingestion, matching, pricing, or approvals logic yet — those screens land as gated placeholders that state the phase they arrive in.

Steps:
1. Enable Lovable Cloud.
2. Design system: brand tokens (navy #061A3D, dark navy #0B2855, ink #12203A, teal #009B93, blue #1253C6, gold #D99A00, bg #F4F7FA, border #E2E8F0, muted #687386, green #119C67, red #D3465B, purple #6D5BD0), Inter + Cairo via root `<link>`, 12–16px radii, restrained shadows, dense-table typography — all as semantic tokens in `src/styles.css`.
3. Migration 1 — tenancy: `profiles`, `organizations`, `organization_memberships`, `company_settings`, `feature_flags`, `app_role` enum, `is_org_member`/`has_org_role` security-definer functions, GRANTs, RLS policies, signup trigger creating `profiles`.
4. Migration 2 — governance foundation: append-only `audit_events` (insert-only policy, no update/delete), `notifications`, seeded `workflow_templates` + `workflow_stages` for the 7-stage flow, `feature_flags` row `roadmap_features=false`.
5. Migration 3 — private storage bucket `tender-files` with org-prefixed path policies (created via the storage tool + `storage.objects` policies), and empty tender-control tables needed for referential integrity only (`clients`, `tenders`) so the dashboard can list real rows.
6. Migration 4 — seed: one organization (Elevate-Gym pilot org), `company_settings`, one seeded client and one sanitized tender header row, workflow rows, feature flag. Users are created by real signup; roles assigned by admin — no public hard-coded passwords.
7. Auth: `/login` (email+password and Google via the Lovable broker) and `/reset-password`; `_authenticated` gate; root `onAuthStateChange` → `router.invalidate()`; session-aware header affordance and clean sign-out.
8. AppShell + navigation + guided stepper matching the approved screens, with `RoleGuard`-aware controls.
9. i18n: i18next with EN/AR resource bundles for nav, statuses, forms, validation, notifications; `dir` toggling at the app root without reload or form-state loss; numbers, currency, part numbers, and cell references stay LTR.
10. Screens delivered in Phase 1 with real data: `/dashboard` (tender portfolio + alerts from DB), `/settings/company`, `/settings/users` (membership + role management), plus permission-aware placeholders for screens 01–06, `/approvals`, `/admin/workflows`, `/settings/catalogues`, `/settings/quotation-template`.
11. Dev-only `Demo Role Switcher`, active only when `VITE_DEMO_MODE=true`, that changes the viewed role for UI purposes and never bypasses server authorization.
12. Visual self-QA: 1920×1080, 1440×900, 1024×768 in EN and AR; assert no document-level horizontal scroll, no clipped or overlapping elements, correct RTL mirroring; repair before reporting.

### Phase 1 tests
- SQL/RLS: user in Org A cannot select or mutate Org B rows or storage objects; `audit_events` rejects UPDATE/DELETE; membership uniqueness holds.
- Server functions: `updateMemberRole` rejects a non-admin caller; `organization_id` supplied by the client is ignored in favour of verified membership.
- Frontend: EN/AR switch preserves form state and flips `dir`; unauthenticated access to `/dashboard` redirects to `/login`.
- Layout: automated `scrollWidth` overflow check on every Phase 1 route in both languages.
- Gates: typecheck, lint, unit tests, production build.

### Phase 1 exit report
Migrations applied, tables + functions + policies added, routes completed, tests run with results, remaining risks, next phase.

## 3. Roadmap (documented only, not implemented)
- Phase 2 — Intake and evidence: uploads, hash/dedupe, async XLSX ingestion of the Elevate Gym workbook with full provenance, multi-sheet navigator, normalized BOQ/requirements, source drawer, exceptions, technical review.
- Phase 3 — Portfolio and sourcing: catalogue import, deterministic hard gates then weighted score, evidence comparison, ex-stock/import/local/foreign branching, supplier quotes, sourcing approval.
- Phase 4 — Commercial and governance: Decimal pricing engine with fixed/percentage factors and explicit bases, pricing versions, maker-checker state machine, approval inbox, quotation preview/release.
- Phase 5 — AI and exports: structured cited AI functions, proposal sections, PDF/DOCX/XLSX exports with manifests and checksums.
- Phase 6 — Hardening: automated + browser tests, RLS/security audit, performance, observability, accessibility, Arabic RTL QA, failure recovery, deployment checklist.

## 4. Risks
Provenance fidelity of the real workbook (merged headers, subtotals, `Rate only`); Worker-runtime limits for PDF/OCR (mitigated by external provider adapter); percentage-basis circularity in pricing (mitigated by ordered factors + basis validation); RTL density in wide tables; approval-invalidation blast radius (mitigated by stage-scoped invalidation with recorded reasons).

## 5. Deferred / blocked scope
Screen-07 SLA analytics and delegation intelligence, Screen-08 drag-and-drop versioned workflow editing (behind `roadmap_features`); autonomous submission or compliance guarantees (never); OCR/PDF extraction and client-facing AI until their secrets are configured; final quotation template fidelity until the company template file is provided.
