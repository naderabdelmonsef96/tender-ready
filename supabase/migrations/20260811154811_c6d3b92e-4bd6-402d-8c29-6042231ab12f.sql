-- Matches the real cost sheet's flow: cost basis -> FX conversion -> freight
-- -> local charges/customs -> landing cost -> GP% -> unit price. Previously
-- margin_percent was applied as a markup directly on cost_basis with no
-- FX/freight/customs step at all. margin_percent now means GP% (price basis,
-- unit_price = landing_cost / (1 - GP%)), enforced below 100 so the divide
-- never breaks.
ALTER TABLE public.pricing_lines
  ADD COLUMN fx_rate numeric(14,6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  ADD COLUMN freight_charges numeric(18,4) NOT NULL DEFAULT 0 CHECK (freight_charges >= 0),
  ADD COLUMN local_charges numeric(18,4) NOT NULL DEFAULT 0 CHECK (local_charges >= 0),
  ADD COLUMN landing_cost numeric(18,4) NOT NULL DEFAULT 0;

ALTER TABLE public.pricing_lines DROP CONSTRAINT pricing_lines_margin_percent_check;
ALTER TABLE public.pricing_lines ADD CONSTRAINT pricing_lines_margin_percent_check
  CHECK (margin_percent >= 0 AND margin_percent < 100);

COMMENT ON COLUMN public.pricing_lines.margin_percent IS
  'Gross profit % of the selling price (unit_price = landing_cost / (1 - margin_percent/100)), not a markup on cost.';