-- Reconciliation pass: Lovable independently built catalogue_import_batches /
-- catalogue_import_rows (JSONB-based) and the catalogue_products supplier
-- columns in parallel with an earlier version of this work. That earlier
-- version (a separate, incompatible catalogue_import_batches/rows shape and
-- a duplicate migration for the same catalogue_products columns) has been
-- removed from this repo. This migration only adds what's still actually
-- missing, and never redefines a table Lovable already owns.

-- The storage bucket Lovable's RLS policies (catalogue_files_read/insert/
-- update/delete on storage.objects) already assume, but never actually
-- created.
insert into storage.buckets (id, name, public)
values ('catalogue-files', 'catalogue-files', false)
on conflict (id) do nothing;

-- Icode is only assigned once a SKU is enlisted/active — every other SKU
-- (including a large bulk import) still needs an identifier, which is the
-- supplier's own code. Safe to run even if already dropped.
DO $$
BEGIN
  ALTER TABLE public.catalogue_products ALTER COLUMN code DROP NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'code DROP NOT NULL step: %', SQLERRM;
END $$;

-- Lovable's migration added the supplier_code/incoterm/landing_cost columns
-- but not the backfill or the constraint — finish that here.
UPDATE public.catalogue_products
SET supplier_code = code
WHERE supplier_code IS NULL AND code IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.catalogue_products ALTER COLUMN supplier_code SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'supplier_code SET NOT NULL step: %', SQLERRM;
END $$;

-- Supplier code is only unique within its own catalogue (brand/supplier) —
-- two different suppliers may coincidentally reuse the same code for
-- unrelated products, and that must never be treated as a match.
DO $$
BEGIN
  ALTER TABLE public.catalogue_products
    ADD CONSTRAINT catalogue_products_catalogue_supplier_code_key UNIQUE (catalogue_id, supplier_code);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'unique constraint already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE INDEX idx_products_supplier_code ON public.catalogue_products(organization_id, supplier_code);
EXCEPTION WHEN duplicate_table THEN
  RAISE NOTICE 'index already exists, skipping';
END $$;
