-- Fields needed to fully populate a company-branded quotation document
-- (Word/PDF export). These vary per released quotation, not per org, so
-- they live on the quotations row rather than being baked into the
-- template file itself.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tax_no text;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS discount numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS other_charges numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS delivery_terms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS warranty text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS incoterms text;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS notes_assumptions text;

-- One company-approved quotation template (.docx) per organization, stored
-- as a real file so it can be filled and downloaded as-is. Only org_admin
-- may upload/replace it — everyone else in the org can read it (needed to
-- generate a quotation document) but never edit it, matching the maker-
-- checker governance model the rest of the app already follows.
insert into storage.buckets (id, name, public)
values ('quotation-templates', 'quotation-templates', false)
on conflict (id) do nothing;

CREATE POLICY quotation_templates_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quotation-templates' AND public.is_org_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY quotation_templates_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));

CREATE POLICY quotation_templates_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'))
WITH CHECK (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));

CREATE POLICY quotation_templates_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quotation-templates'
  AND public.has_org_role(((storage.foldername(name))[1])::uuid, 'org_admin'));
