# Phase 2 — Tender Intake and Evidence

Goal: turn screens 01 and 02 into real functionality. A proposal engineer registers a tender, uploads the real tender workbook, the system ingests it server-side with cell-level provenance, and a technical reviewer works a normalized BOQ / requirements register where every row can be traced back to the exact file, sheet, and cell. Nothing is invented; anything the parser cannot support becomes an exception.

Phase 1 stays untouched in behaviour: tenancy, auth, RLS, storage, audit, EN/AR, design system, and all 24 passing tests remain green.

## What the user gets

### 1. Tender Intake (screen 01)
- Register a tender: reference (auto-suggested from the organization pattern, editable), title EN/AR, client (pick existing or create inline), project location, submission deadline, currency, estimated value, owner, notes.
- Upload one or many tender files (XLSX/CSV now; PDF/DOCX accepted and stored but queued as "extraction integration required" rather than faked).
- Each upload is stored privately under the organization's folder, hashed, and versioned. Re-uploading the same content is recognized as a duplicate; a changed file becomes a new document version that supersedes the previous one and records who replaced it and why.
- File list shows version, uploader, timestamp, size, hash short-form, and ingestion status (queued, running, complete, partial, failed) with a signed-URL download that expires.
- "Start extraction" begins ingestion; the card polls and shows progress, rows found, sheets found, and exceptions raised. Repeat clicks are idempotent.
- Intake completeness checklist (client, deadline, currency, at least one ingested file) gates the "continue to requirements" action.

### 2. BOQ and Requirements register (screen 02)
- Multi-sheet navigator mirroring the workbook's sheets, with row counts and per-sheet ingestion notes.
- Dense, scrollable table of normalized items: item code, description EN/AR, unit, quantity, rate-only flag, section/heading path, notes, confidence, and status (needs review, reviewed, exception).
- Evidence strip / source drawer on every row: file name, version, sheet, row and cell reference, the original raw text, the normalized text, and confidence. Cell references and numbers stay LTR in Arabic.
- Requirements register for non-priced obligations extracted from specification and notes rows, each carrying the same provenance.
- Inline review edits (description, unit, quantity, classification) with bilingual validation. Every material edit creates a new item version, records the previous value in audit, and flags downstream stages as affected.
- Exceptions queue: merged headers, subtotal rows, blank or non-numeric quantities, unparsable units, missing source anchors. Each exception can be resolved, reclassified, or overridden with a named reason.
- Critical items cannot be marked reviewed without a source reference or an explicit named override with a reason.
- Technical review submission: the register is submitted to the Technical stage using the existing approval inbox; the submitter cannot approve their own submission. Approve / request changes / reject with a required note on rejection.
- Bulk actions: mark rows reviewed, reclassify section, exclude a row from pricing with reason.

### 3. States and QA
- Real loading skeletons, empty states ("no file uploaded yet", "no items in this sheet"), partial-ingestion warnings, failure states with retry, and success toasts, all bilingual.
- Visual self-QA at 1920x1080, 1440x900 and 1024x768 in English and Arabic with long labels, large EGP values, and dense rows; repair overflow, clipping, broken columns, and mirrored padding before reporting complete.

## Out of scope for Phase 2

Portfolio matching, supply routes, pricing engine, quotation preview or release, AI-assisted extraction and cited AI drafting, exports, PDF/OCR extraction execution, SLA analytics, and the visual workflow editor. Screens 07–08 stay behind `roadmap_features`. Phases 3–6 are not started.

## Technical plan

### Migration (single reviewed migration, additive only)
New tables, all `organization_id`-scoped, with GRANTs then RLS then policies in that order:
- `tender_files` (tender, original name, mime, size, storage path, uploaded_by, current version pointer)
- `document_versions` (file, version no., sha256, storage path, supersedes, uploaded_by, replace reason) — unique `(tender_id, sha256)`
- `extraction_jobs` (document version, status, idempotency key unique per org, sheets/rows counters, error summary, started/finished at)
- `source_references` (document version, sheet name, sheet index, page, row index, cell ref, raw excerpt, normalized text, confidence)
- `boq_items` (tender, sheet, order, item code, description EN/AR, unit, quantity `numeric(18,4)`, rate_only flag, section path, classification, status, confidence, source_reference_id, version, created_by, reviewed_by)
- `requirements` (tender, category, text EN/AR, criticality, status, source_reference_id, version, reviewed_by)
- `extraction_exceptions` (tender, document version, kind, message, sheet/row anchor, status, resolution note, resolved_by)
- `workflow_instances` + `approval_tasks` / `approval_decisions` limited to what the Technical stage needs, reusing the seeded `workflow_stages`.
Read policies: any active org member. Write policies: role-based (`proposal_engineer`/`org_admin` for intake and items; `technical_lead`/`org_admin` for review decisions). Storage stays private with org-prefixed paths.

### Server functions (`createServerFn`, authenticated middleware, Zod input, org verified server-side)
`createTender`, `updateTender`, `requestUploadUrl`, `registerUploadedFile`, `replaceFileVersion`, `startExtraction` (idempotency key), `getExtractionStatus`, `listTenderFiles`, `getSignedFileUrl`, `listBoqItems`, `updateBoqItem`, `bulkUpdateBoqItems`, `listRequirements`, `updateRequirement`, `listExceptions`, `resolveException`, `submitTechnicalReview`, `decideTechnicalReview`. Every mutation writes an append-only audit event with a correlation id; material edits bump `version` and record invalidation of downstream stages only.

### Ingestion
XLSX/CSV parsed inside a server function with a Worker-safe pure-JS parser. Deterministic pipeline: detect header band, walk data rows, capture section headings, normalize units and quantities, emit one `source_references` row per captured cell, then insert items in a transaction keyed to the job. No AI in this phase. Unsupported types (PDF/DOCX/scans) store the file, create a job in `integration_required`, and surface that state in the UI.

### Frontend
`/workbench/intake` and `/workbench/boq` replace their placeholders, keeping the approved shell, stepper position, cards, evidence strip, and tokens. TanStack Query keyed by organization and tender; React Hook Form + Zod; Decimal.js for any quantity or value math; strict TypeScript, no `any`; all new copy added to both EN and AR bundles.

### Tests and gates
- Unit: workbook parser fixtures from the real Elevate Gym BOQ (merged headers, `Rate only` rows, subtotals, blank quantities), unit/quantity normalization, EN/AR key parity for new copy.
- Access: anonymous and cross-organization probes for every new table; audit rows still reject update/delete.
- Rules: self-approval rejected server-side; reviewing a critical item without a source reference rejected unless an override reason is supplied; duplicate upload detected by hash; repeated `startExtraction` produces one job.
- Layout: overflow sweep on both screens at three widths in EN and AR.
- Gates: typecheck, lint, full test run, production build — reported with exact numbers plus remaining risks.
