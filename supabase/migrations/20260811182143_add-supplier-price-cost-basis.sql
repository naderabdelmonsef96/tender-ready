-- The "import" supply route resolves cost basis from the matched product's
-- supplier price list entry (catalogue_products.base_cost), not a supplier
-- quote or landing cost. pricing_lines.cost_basis_source needs a third
-- allowed value to record that honestly instead of the write failing.
ALTER TABLE public.pricing_lines DROP CONSTRAINT pricing_lines_cost_basis_source_check;
ALTER TABLE public.pricing_lines ADD CONSTRAINT pricing_lines_cost_basis_source_check
  CHECK (cost_basis_source IN ('landing_cost', 'supplier_price', 'supplier_quote'));
