CREATE POLICY tender_files_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'tender-files' AND public.is_org_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY tender_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tender-files'
  AND public.has_any_org_role(((storage.foldername(name))[1])::uuid, ARRAY['org_admin','proposal_engineer']::public.app_role[]));

CREATE POLICY tender_files_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tender-files'
  AND public.has_any_org_role(((storage.foldername(name))[1])::uuid, ARRAY['org_admin','proposal_engineer']::public.app_role[]))
WITH CHECK (bucket_id = 'tender-files'
  AND public.has_any_org_role(((storage.foldername(name))[1])::uuid, ARRAY['org_admin','proposal_engineer']::public.app_role[]));

CREATE POLICY tender_files_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'tender-files' AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));