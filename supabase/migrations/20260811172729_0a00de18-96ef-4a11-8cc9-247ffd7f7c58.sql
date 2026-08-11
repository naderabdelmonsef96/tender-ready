ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tax_no text;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS discount numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS other_charges numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS delivery_terms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS warranty text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS incoterms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS notes_assumptions text;

DROP POLICY IF EXISTS quotation_templates_read ON storage.objects;
CREATE POLICY quotation_templates_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quotation-templates' AND public.is_org_member(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS quotation_templates_insert ON storage.objects;
CREATE POLICY quotation_templates_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));

DROP POLICY IF EXISTS quotation_templates_update ON storage.objects;
CREATE POLICY quotation_templates_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'))
WITH CHECK (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));

DROP POLICY IF EXISTS quotation_templates_delete ON storage.objects;
CREATE POLICY quotation_templates_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));