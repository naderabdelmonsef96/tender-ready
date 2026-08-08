# TenderReady — Guided Governance MVP

Build the app exactly as the uploaded 8-screen journey specifies: a guided, evidence-linked tender workflow for an internal proposals/procurement team, using the real Elevate Gym at Silver Sands BOQ as the demo tender.

## Design (locked from the PDF)

- Dark navy sidebar workspace nav, light slate canvas, white cards with soft borders.
- Brand palette from the uploaded logo: navy `#0E2149`, teal `#0F8A80`, amber `#D89A0E`, blue `#1560D4`.
- Uploaded logo used in the sidebar; favicon derived from it.
- Every screen: project header strip (client / location / area), EN|AR + "Evidence-linked" chips, screen counter, a 6-step Intake → Technical → Product → Sourcing → Commercial → Release stepper, current-user role badge (Maker / Checker / Admin), and a sticky bottom action bar.
- One decision per screen. Status pills: Ready (teal), Review (amber), Exception (red).

## Screens

1. **Dashboard** — portfolio of tenders, pending gates, SLA health, quick entry to the active tender.
2. **Tender Intake** — 4 KPI tiles, tender-package source table with validation state, locked data-boundary bar, extraction-readiness ring (96%), human-checkpoint callout, project profile, Save intake / Start BOQ extraction.
3. **BOQ & Requirements** — 5 metric tiles, filterable source-linked requirement register with confidence %, source provenance panel, exception queue (missing quantities, ambiguous units, low confidence, duplicates), assigned checker, draft version note.
4. **Portfolio Match** — selected requirement vs agency catalogue candidates, recommended SKU with fit %, evidence coverage, checker decision (Approve match / Request changes / Route outside portfolio), maker-checker rule banner, Gate 03 status.
5. **Supply Routes** — routing branches (ex-stock, agency import, local sourcing, foreign RFQ), routed-items table, editable commercial inputs (lead time, FX, Incoterms, freight, duty, insurance, validity), route review panel, open-risk callout, sourcing approval bar.
6. **Pricing Builder** — cost build-up table per cost group (base, freight, duty, contingency, markup as fixed or %), adjustment lines, live margin cockpit (total quotation, gross profit, target vs achieved margin, buffer), policy check, maker restriction note, Submit for Commercial Approval.
7. **Commercial Review & Quotation** — read-only checker view of pricing with evidence strip, 6 governance tiles, Gate 05 decision with mandatory decision note, approval trail, quotation preview.
8. **Approval Center** — approval inbox (Pending / Submitted / Changes Requested / Overdue), queue rows with SLA and risk, decision packet with full approval trail and delegate action, queue intelligence panel.
9. **Workflow Settings** — draft v3.1 vs active v3.0, 7 approval gates, conditional escalation rules, enterprise control toggles (maker-checker separation, sequential approval, delegation expiry, SLA escalation, notes required), publish impact.

## Behaviour in this MVP

- Data comes from a seeded in-app dataset derived from the real uploaded workbook (20 sheets, divisions, disciplines, EGP figures) — no backend yet, so the whole journey is clickable and demo-safe.
- Working interactions: stepper navigation, filters and tabs on the register and approval inbox, row selection driving the provenance/route/decision side panels, editable pricing factors that recompute totals and margin live, gate approve / request-changes state changes, role switcher that enforces maker-checker (a maker cannot approve their own submission).

## Technical notes

- TanStack Start routes: `/` (dashboard), `/intake`, `/boq`, `/portfolio-match`, `/supply-routes`, `/pricing`, `/commercial-review`, `/approvals`, `/settings`; shared workspace shell (sidebar + header + stepper) in a layout route.
- Design tokens added to `src/styles.css` in oklch; shadcn components restyled via variants — no hardcoded color classes.
- Seed data in typed modules under `src/data/` (tender, source files, requirements, catalogue, routes, pricing groups, approvals, workflow config); pricing/margin math in a pure `src/lib/pricing.ts`.
- Logo served via a Lovable asset pointer; square favicon written to `public/`.
- Per-route head metadata; app-shell routes marked noindex-friendly titles.

## Later (not in this pass)

Lovable Cloud for real accounts, persisted tenders, actual XLSX upload + parsing, and a real audit log — the seeded MVP is structured so each dataset maps 1:1 to a future table.
