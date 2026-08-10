UPDATE public.catalogue_products
   SET supplier_code = COALESCE(NULLIF(trim(supplier_code), ''), code)
 WHERE supplier_code IS NULL OR trim(supplier_code) = '';

ALTER TABLE public.catalogue_products
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN supplier_code SET NOT NULL;