-- Defect fix: catalogue_import_batches/rows write policies only required org
-- membership, not catalogue-management role — inconsistent with
-- catalogue_products itself (write requires can_manage_catalogue). Any org
-- member, regardless of role, could upload files and trigger paid AI
-- extraction calls, and read extracted supplier pricing, without being an
-- authorized catalogue manager. Read stays org-wide (consistent with
-- catalogue_products' own read policy); only write access is tightened.

DROP POLICY IF EXISTS "Members can create own import batches" ON public.catalogue_import_batches;
DROP POLICY IF EXISTS "Members can update own import batches" ON public.catalogue_import_batches;
DROP POLICY IF EXISTS "Members can delete own import batches" ON public.catalogue_import_batches;

CREATE POLICY "Managers can create import batches"
  ON public.catalogue_import_batches FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_catalogue(organization_id));

CREATE POLICY "Managers can update import batches"
  ON public.catalogue_import_batches FOR UPDATE
  TO authenticated
  USING (public.can_manage_catalogue(organization_id))
  WITH CHECK (public.can_manage_catalogue(organization_id));

CREATE POLICY "Managers can delete import batches"
  ON public.catalogue_import_batches FOR DELETE
  TO authenticated
  USING (public.can_manage_catalogue(organization_id));

DROP POLICY IF EXISTS "Members can create own import rows" ON public.catalogue_import_rows;
DROP POLICY IF EXISTS "Members can update own import rows" ON public.catalogue_import_rows;

CREATE POLICY "Managers can create import rows"
  ON public.catalogue_import_rows FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.can_manage_catalogue(b.organization_id)
  ));

CREATE POLICY "Managers can update import rows"
  ON public.catalogue_import_rows FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.can_manage_catalogue(b.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalogue_import_batches b
    WHERE b.id = batch_id AND public.can_manage_catalogue(b.organization_id)
  ));

-- The storage upload/update/delete policies already require can_manage_catalogue
-- (see the earlier reconciliation migration) — only the table-level policies
-- above had the gap.
