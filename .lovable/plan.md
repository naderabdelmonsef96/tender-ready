# Apply the Phase 4 pricing & quotation migration

Confirmed against the live database: `pricing_lines`, `quotations`, and `quotation_lines` do not exist, and the three permission helpers (`can_decide_pricing`, `can_decide_finance`, `can_release_quotation`) are missing. The roles the SQL references (`commercial_manager`, `finance_manager`, `signatory`) already exist in the role list, so the script is compatible as written. This is also the cause of the current error on the Pricing screen ("Could not find the table 'public.pricing_lines'").

## What will be applied

- Three permission helper functions:
  - pricing decisions: org admin, proposal engineer, commercial manager
  - finance decisions: org admin, finance manager
  - quotation release: org admin, signatory
- `pricing_lines` — one priced line per BOQ item: cost basis and its currency, where the cost came from (landing cost or accepted supplier quote), margin percent, unit price, total price, note, decision stamp, version.
- `quotations` — one row per quotation: number (unique per organization), currency, frozen exchange rates, subtotal, VAT, total, validity date, draft/released status, release stamp.
- `quotation_lines` — the line items of a quotation: description (EN/AR), unit, quantity, unit price, total, sort order.

## Access rules

- Anyone in the organization can read all three tables.
- Only pricing decision-makers can create or change pricing lines.
- Only release-authorized users (org admin, signatory) can create or change quotations and their lines.
- Automatic "last updated" timestamps on pricing lines and quotations; indexes for fast per-tender lookups.

## Note

The Pricing screen and its server code are already in the project but currently fail — both at runtime and at typecheck — because the tables don't exist yet. Applying this migration regenerates the database types and clears those errors; the Commercial Review & Quotation screen is still Phase 4 work and not built yet.


## Technical

Applied verbatim from `20260810080000_53200a0f-1c2f-4581-a6df-d02ee13c730f.sql` via the migration tool: `CREATE OR REPLACE FUNCTION` + `GRANT EXECUTE` for the three helpers, then for each table `CREATE TABLE` → `GRANT` to `authenticated`/`service_role` → `ENABLE ROW LEVEL SECURITY` → policies, plus `set_updated_at` triggers and the two composite indexes. No `anon` grants (all policies are membership-scoped). No changes to existing tables or workflow stages.
