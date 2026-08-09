-- Catalogue foundation: separate the org's own item code (Icode) from the
-- supplier's own code, and separate the raw supplier price from a computed
-- landing cost that only applies to ex-stock items.

-- Icode is now only assigned once a SKU is enlisted/active; every other SKU
-- (including large bulk-imported, never-activated catalogues) still needs an
-- identifier, which is the supplier's own code.
ALTER TABLE public.catalogue_products ALTER COLUMN code DROP NOT NULL;

ALTER TABLE public.catalogue_products ADD COLUMN supplier_code text;
UPDATE public.catalogue_products SET supplier_code = code WHERE supplier_code IS NULL;
ALTER TABLE public.catalogue_products ALTER COLUMN supplier_code SET NOT NULL;

-- Supplier code is only unique within its own catalogue (brand/supplier) —
-- two different suppliers may coincidentally reuse the same code for
-- unrelated products, and that must never be treated as a match.
ALTER TABLE public.catalogue_products
  ADD CONSTRAINT catalogue_products_catalogue_supplier_code_key UNIQUE (catalogue_id, supplier_code);
CREATE INDEX idx_products_supplier_code ON public.catalogue_products(organization_id, supplier_code);

-- The Incoterm the current supplier price is quoted under (EXW, CIF, CIP, ...).
ALTER TABLE public.catalogue_products ADD COLUMN incoterm text;

-- Landing cost is distinct from supplier price: it only exists for SKUs
-- actually held in stock, computed from supplier price + FX + freight + duty.
-- It is null for every SKU with no stock, regardless of active status.
ALTER TABLE public.catalogue_products ADD COLUMN landing_cost numeric(18,4);
ALTER TABLE public.catalogue_products ADD COLUMN landing_cost_currency text;
ALTER TABLE public.catalogue_products ADD COLUMN landing_cost_updated_at timestamptz;
