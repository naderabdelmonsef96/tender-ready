-- Admin override: org_admin may approve/decide a stage they submitted
-- themselves, but only with a documented reason, and it is permanently
-- distinguishable from a genuine second-party decision.
ALTER TABLE public.approval_decisions ADD COLUMN is_override boolean NOT NULL DEFAULT false;

-- The admin-override feature (app-layer) allowed org_admin to decide a
-- stage they submitted themselves, but the RLS policies underneath still
-- hardcoded submitted_by <> auth.uid() unconditionally, silently filtering
-- the write to zero rows (surfacing as "Cannot coerce the result to a
-- single JSON object" from .single()). Fix both policies to match: an
-- org_admin may act on their own submission; anyone else still may not.

DROP POLICY IF EXISTS approval_tasks_update ON public.approval_tasks;
CREATE POLICY approval_tasks_update ON public.approval_tasks FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, 'org_admin'::app_role)
    OR (submitted_by <> auth.uid() AND public.has_org_role(organization_id, approver_role))
  )
  WITH CHECK (
    public.has_org_role(organization_id, 'org_admin'::app_role)
    OR (submitted_by <> auth.uid() AND public.has_org_role(organization_id, approver_role))
  );

DROP POLICY IF EXISTS approval_decisions_insert ON public.approval_decisions;
CREATE POLICY approval_decisions_insert ON public.approval_decisions FOR INSERT TO authenticated
  WITH CHECK (
    decided_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.approval_tasks t
      WHERE t.id = task_id
        AND t.organization_id = approval_decisions.organization_id
        AND (
          (
            t.submitted_by <> auth.uid()
            AND (public.has_org_role(t.organization_id, 'org_admin'::app_role) OR public.has_org_role(t.organization_id, t.approver_role))
          )
          OR (
            t.submitted_by = auth.uid()
            AND public.has_org_role(t.organization_id, 'org_admin'::app_role)
            AND coalesce(trim(approval_decisions.note), '') <> ''
          )
        )
    )
  );