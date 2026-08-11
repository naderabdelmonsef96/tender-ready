-- The workflow designer was seeded read-only (SELECT-only grant, no write
-- RLS policy). Org admins can now tune the approver role, SLA window and
-- release-blocking flag per stage — the stage/stage_order/template_id
-- themselves stay structural and are not exposed as editable.
GRANT UPDATE ON public.workflow_stages TO authenticated;

CREATE POLICY wf_stages_update ON public.workflow_stages FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, 'org_admin'))
WITH CHECK (public.has_org_role(organization_id, 'org_admin'));
