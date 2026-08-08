# TenderReady — Tender-to-Quotation OS (MVP)

Build TenderReady as a real multi-tenant application: tender files in, source-linked requirements, portfolio matching, sourcing routes, editable landed cost and margin, maker-checker approvals, and a quotation released on the company template. The eight uploaded screens are the visual source of truth and will be preserved in information architecture, density, and proportions.

## Scope boundary

- **Real end-to-end:** screens 01–06 — Tender Intake, BOQ & Requirements, Portfolio Match, Supply Route, Pricing Builder, Commercial Review & Quotation, plus the minimum Approval Inbox needed to complete those flows.
- **Behind a `roadmap_features` flag:** screen 07 SLA analytics and delegation, screen 08 drag-and-drop versioned workflow editing. Workflow gates and rules are seeded and admin-readable only.

## Backend (Lovable Cloud)

Enabling Cloud gives login, Postgres, private file storage, and server-side logic.

- **Tenancy:** every business row carries `org_id`; RLS scopes all reads/writes to the caller's organization. Roles live in a separate `user_roles` table (Org Admin, Proposal Engineer/Maker, Technical Lead, Product Manager, Sourcing Manager, Commercial Manager, Finance Manager, GM/Signatory, Viewer/Auditor) checked through a security-definer `has_role`.
- **Core tables:** organizations, org_members, user_roles, tenders, tender_files, extraction_runs, requirements, requirement_exceptions, portfolio_products, product_matches, supply_routes, supplier_quotes, pricing_versions, pricing_lines, quotations, approvals, approval_gates, workflow_rules, audit_events.
- **Provenance:** each requirement stores file id, file version, sheet/page, row/cell, original text, normalized text, and confidence. Nothing is approvable without a source reference or a named override carrying a reason.
- **Money:** Postgres `numeric` throughout; Decimal.js for client-side arithmetic.
- **Files:** private storage bucket, access only via authenticated signed URLs.
- **Server-side enforcement:** approval transitions run in server functions inside transactions with idempotency keys. The maker-checker rule (no approving an object you created or materially edited) is enforced in the database/server, not just hidden in the UI. Every material edit creates a version and invalidates only affected downstream approvals; upstream approved evidence stays valid.
- **Audit:** append-only `audit_events` for approval and security-relevant actions.
- **XLSX extraction:** uploaded workbooks are parsed server-side into requirements with per-cell provenance and a confidence score; unreadable or low-confidence output goes to the exception queue. Never fabricate quantities, prices, brands, suppliers, compliance claims, or citations.
- **Seed:** the real Elevate Gym at Silver Sands BOQ (20 sheets, 5 disciplines, EGP, Ora Developments, 1,580 sqm) plus the RFQ workbook and demo org/users/roles are inserted by migration so the first screen is populated.

## Screens

1. **Tender Intake** — 4 KPI tiles, tender-package source table with validation state, locked data-boundary bar, extraction-readiness ring, human-checkpoint callout, project profile, Save intake / Start BOQ extraction.
2. **BOQ & Requirements** — 5 metric tiles, filterable source-linked requirement register with confidence and status, provenance panel resolving to the exact workbook cell, exception queue (missing quantities, ambiguous units, low confidence, duplicates), assigned checker, draft version banner.
3. **Portfolio Match** — requirement vs agency catalogue candidates, recommended SKU with technical fit, evidence coverage, approve / request changes / route outside portfolio, maker-checker banner, Gate 03 state.
4. **Supply Route** — company product branching to ex-stock or import; outside-portfolio branching to local supplier or foreign RFQ. Routed-items table, editable commercial inputs (lead time, FX, Incoterms, freight, duty, insurance, validity) feeding Pricing Builder, route review and open-risk panels.
5. **Pricing Builder** — cost build-up per cost group with every factor editable as fixed amount or percentage against an explicit calculation basis; adjustment lines; live margin cockpit (quotation total, gross profit, target vs achieved margin, buffer); policy threshold check; maker cannot approve own pricing.
6. **Commercial Review & Quotation** — read-only checker view with field-level evidence strip, governance tiles, Gate 05 decision with mandatory note, approval trail, quotation preview on the organization's template (logo, identity, terms, currency, validity, numbering, signature block). Internal cost, margin, and sourcing notes never appear in client-facing output.
7. **Approval Inbox** — pending / submitted / changes requested / overdue queues, decision packet, approval trail, approve or request changes.
8. **Dashboard** and **Workflow Settings** (read-only gates and rules).

## Design system

- Tokens in `src/styles.css` (oklch): navy `#061A3D`, dark navy `#0B2855`, ink `#12203A`, teal `#009B93`, blue `#1253C6`, gold `#D99A00`, background `#F4F7FA`, border `#E2E8F0`, muted `#687386`, green `#119C67`, red `#D3465B`, purple `#6D5BD0`. Radii 12–16px, restrained shadows, dense but readable tables.
- Inter for English, Cairo for Arabic, loaded via `<link>` in the root route.
- Shared workspace shell: dark navy sidebar with the TenderReady 08B logo, project header strip, EN|AR toggle always visible, Evidence-linked chip, six-step Intake → Release stepper, role badge, sticky bottom action bar.
- EN/AR switching flips `dir` without reload or losing form state; all copy comes from a translation layer.
- Full loading, empty, error, and success states on every surface. Accessible labels, keyboard navigation, visible focus, semantic tables, AA contrast.

## Visual self-QA

Each screen is inspected at 1920×1080, 1440×900, and 1024×768 in both LTR and RTL, with long EN/AR labels and large EGP values, and defects (overflow, clipping, broken columns, unwanted horizontal scroll, z-index, inconsistent padding) are repaired before the screen is reported complete — without altering the approved design language.

## Technical notes

- React 19 + TypeScript strict, no `any`. TanStack Start routes with a shared `_workspace` layout; TanStack Query for server state; React Hook Form + Zod for forms.
- All mutations go through `createServerFn` with auth middleware; secrets stay server-side.
- Logo served as a Lovable asset pointer; square favicon written to `public/`.

## Build order

1. Cloud + schema, RLS, roles, seed data, design system and workspace shell.
2. Screens 01–02 (intake, extraction, requirements register with provenance and exceptions).
3. Screens 03–04 (portfolio match, supply routes).
4. Screens 05–06 (pricing builder, commercial review, quotation output).
5. Approval inbox, audit trail, EN/AR pass, visual QA sweep.
