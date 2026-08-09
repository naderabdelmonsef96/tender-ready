CREATE TABLE IF NOT EXISTS public.catalogue_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending',
    file_name TEXT,
    storage_path TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_import_batches TO authenticated;
GRANT ALL ON public.catalogue_import_batches TO service_role;

ALTER TABLE public.catalogue_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own import batches"
  ON public.catalogue_import_batches FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Members can create own import batches"
  ON public.catalogue_import_batches FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Members can update own import batches"
  ON public.catalogue_import_batches FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Members can delete own import batches"
  ON public.catalogue_import_batches FOR DELETE
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.catalogue_import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.catalogue_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER,
    raw_data JSONB,
    mapped_data JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.catalogue_import_rows TO authenticated;
GRANT ALL ON public.catalogue_import_rows TO service_role;

ALTER TABLE public.catalogue_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own import rows"
  ON public.catalogue_import_rows FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.is_org_member(b.organization_id)
  ));

CREATE POLICY "Members can create own import rows"
  ON public.catalogue_import_rows FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.is_org_member(b.organization_id)
  ));

CREATE POLICY "Members can update own import rows"
  ON public.catalogue_import_rows FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.is_org_member(b.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.is_org_member(b.organization_id)
  ));

CREATE TRIGGER trg_import_batches_updated
  BEFORE UPDATE ON public.catalogue_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_rows_updated
  BEFORE UPDATE ON public.catalogue_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();