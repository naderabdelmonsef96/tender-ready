-- Cost basis becomes always-editable (a "manual" source alongside the
-- existing auto-resolved ones), and freight/local charges can each be
-- entered as a flat value in the landed currency OR as a percentage of
-- the converted cost basis. freight_charges/local_charges keep storing
-- the resolved currency amount (what actually feeds landing_cost);
-- freight_input/local_input store the raw number the user typed, so the
-- percent-vs-value choice survives a reload instead of being lossy.
ALTER TABLE public.pricing_lines DROP CONSTRAINT pricing_lines_cost_basis_source_check;
ALTER TABLE public.pricing_lines ADD CONSTRAINT pricing_lines_cost_basis_source_check
  CHECK (cost_basis_source IN ('landing_cost', 'supplier_price', 'supplier_quote', 'manual'));

ALTER TABLE public.pricing_lines
  ADD COLUMN freight_mode text NOT NULL DEFAULT 'value' CHECK (freight_mode IN ('value', 'percent')),
  ADD COLUMN freight_input numeric(18,4) NOT NULL DEFAULT 0 CHECK (freight_input >= 0),
  ADD COLUMN local_mode text NOT NULL DEFAULT 'value' CHECK (local_mode IN ('value', 'percent')),
  ADD COLUMN local_input numeric(18,4) NOT NULL DEFAULT 0 CHECK (local_input >= 0);
