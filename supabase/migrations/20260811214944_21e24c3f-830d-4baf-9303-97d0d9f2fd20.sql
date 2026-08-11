GRANT UPDATE ON public.workflow_stages TO authenticated;

CREATE POLICY wf_stages_update ON public.workflow_stages FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, 'org_admin'))
WITH CHECK (public.has_org_role(organization_id, 'org_admin'));