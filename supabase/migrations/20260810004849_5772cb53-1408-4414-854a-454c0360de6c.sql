ALTER TABLE public.catalogue_products
  ADD COLUMN IF NOT EXISTS landing_cost_currency TEXT,
  ADD COLUMN IF NOT EXISTS landing_cost_updated_at TIMESTAMP WITH TIME ZONE;