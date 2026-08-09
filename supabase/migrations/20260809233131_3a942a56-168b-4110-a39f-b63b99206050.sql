CREATE POLICY "catalogue_files_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'catalogue-files' AND public.is_org_member((storage.foldername(name))[1]::uuid));

CREATE POLICY "catalogue_files_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'catalogue-files' AND public.has_any_org_role((storage.foldername(name))[1]::uuid, ARRAY['org_admin','product_manager']::app_role[]));

CREATE POLICY "catalogue_files_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'catalogue-files' AND public.has_any_org_role((storage.foldername(name))[1]::uuid, ARRAY['org_admin','product_manager']::app_role[]))
  WITH CHECK (bucket_id = 'catalogue-files' AND public.has_any_org_role((storage.foldername(name))[1]::uuid, ARRAY['org_admin','product_manager']::app_role[]));

CREATE POLICY "catalogue_files_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'catalogue-files' AND public.has_org_role((storage.foldername(name))[1]::uuid, 'org_admin'::app_role));