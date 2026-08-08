-- ENUMS
CREATE TYPE public.extraction_status AS ENUM ('queued','running','complete','partial','failed','integration_required');
CREATE TYPE public.item_review_status AS ENUM ('needs_review','reviewed','exception','excluded');
CREATE TYPE public.exception_status AS ENUM ('open','resolved','overridden');
CREATE TYPE public.criticality AS ENUM ('standard','critical');

-- HELPERS
CREATE OR REPLACE FUNCTION public.can_edit_intake(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','proposal_engineer']::app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.can_review_technical(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','proposal_engineer','technical_lead']::app_role[]);
$$;

-- TENDER FILES
CREATE TABLE public.tender_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  mime_type text,
  kind text NOT NULL DEFAULT 'tender_document',
  current_version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_files TO authenticated;
GRANT ALL ON public.tender_files TO service_role;
ALTER TABLE public.tender_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY tender_files_select ON public.tender_files FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY tender_files_write ON public.tender_files FOR ALL TO authenticated USING (public.can_edit_intake(organization_id)) WITH CHECK (public.can_edit_intake(organization_id));
CREATE TRIGGER trg_tender_files_updated BEFORE UPDATE ON public.tender_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_tender_files_tender ON public.tender_files(tender_id);

-- DOCUMENT VERSIONS
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.tender_files(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  supersedes_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  replace_reason text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id, sha256),
  UNIQUE (file_id, version_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_versions_select ON public.document_versions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY document_versions_write ON public.document_versions FOR ALL TO authenticated USING (public.can_edit_intake(organization_id)) WITH CHECK (public.can_edit_intake(organization_id));
CREATE INDEX idx_document_versions_file ON public.document_versions(file_id);

-- EXTRACTION JOBS
CREATE TABLE public.extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status public.extraction_status NOT NULL DEFAULT 'queued',
  sheets_found integer NOT NULL DEFAULT 0,
  rows_scanned integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  requirements_created integer NOT NULL DEFAULT 0,
  exceptions_created integer NOT NULL DEFAULT 0,
  sheet_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_jobs TO authenticated;
GRANT ALL ON public.extraction_jobs TO service_role;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY extraction_jobs_select ON public.extraction_jobs FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY extraction_jobs_write ON public.extraction_jobs FOR ALL TO authenticated USING (public.can_edit_intake(organization_id)) WITH CHECK (public.can_edit_intake(organization_id));
CREATE TRIGGER trg_extraction_jobs_updated BEFORE UPDATE ON public.extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_extraction_jobs_docver ON public.extraction_jobs(document_version_id);

-- SOURCE REFERENCES
CREATE TABLE public.source_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  sheet_name text,
  sheet_index integer,
  page_number integer,
  row_index integer,
  cell_ref text,
  raw_text text,
  normalized_text text,
  confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_references TO authenticated;
GRANT ALL ON public.source_references TO service_role;
ALTER TABLE public.source_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_references_select ON public.source_references FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY source_references_write ON public.source_references FOR ALL TO authenticated USING (public.can_edit_intake(organization_id)) WITH CHECK (public.can_edit_intake(organization_id));
CREATE INDEX idx_source_refs_docver ON public.source_references(document_version_id);

-- BOQ ITEMS
CREATE TABLE public.boq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  document_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  source_reference_id uuid REFERENCES public.source_references(id) ON DELETE SET NULL,
  sheet_name text,
  sheet_index integer,
  display_order integer NOT NULL DEFAULT 0,
  item_code text,
  description text NOT NULL,
  description_ar text,
  unit text,
  quantity numeric(18,4),
  rate_only boolean NOT NULL DEFAULT false,
  section_path text,
  criticality public.criticality NOT NULL DEFAULT 'standard',
  status public.item_review_status NOT NULL DEFAULT 'needs_review',
  confidence numeric(5,4),
  notes text,
  exclusion_reason text,
  override_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boq_items TO authenticated;
GRANT ALL ON public.boq_items TO service_role;
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY boq_items_select ON public.boq_items FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY boq_items_insert ON public.boq_items FOR INSERT TO authenticated WITH CHECK (public.can_edit_intake(organization_id));
CREATE POLICY boq_items_update ON public.boq_items FOR UPDATE TO authenticated USING (public.can_review_technical(organization_id)) WITH CHECK (public.can_review_technical(organization_id));
CREATE POLICY boq_items_delete ON public.boq_items FOR DELETE TO authenticated USING (public.can_edit_intake(organization_id));
CREATE TRIGGER trg_boq_items_updated BEFORE UPDATE ON public.boq_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_boq_items_tender ON public.boq_items(tender_id, sheet_index, display_order);

-- REQUIREMENTS
CREATE TABLE public.requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  document_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  source_reference_id uuid REFERENCES public.source_references(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  text text NOT NULL,
  text_ar text,
  criticality public.criticality NOT NULL DEFAULT 'standard',
  status public.item_review_status NOT NULL DEFAULT 'needs_review',
  confidence numeric(5,4),
  override_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requirements TO authenticated;
GRANT ALL ON public.requirements TO service_role;
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY requirements_select ON public.requirements FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY requirements_insert ON public.requirements FOR INSERT TO authenticated WITH CHECK (public.can_edit_intake(organization_id));
CREATE POLICY requirements_update ON public.requirements FOR UPDATE TO authenticated USING (public.can_review_technical(organization_id)) WITH CHECK (public.can_review_technical(organization_id));
CREATE POLICY requirements_delete ON public.requirements FOR DELETE TO authenticated USING (public.can_edit_intake(organization_id));
CREATE TRIGGER trg_requirements_updated BEFORE UPDATE ON public.requirements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_requirements_tender ON public.requirements(tender_id);

-- EXTRACTION EXCEPTIONS
CREATE TABLE public.extraction_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  document_version_id uuid REFERENCES public.document_versions(id) ON DELETE CASCADE,
  boq_item_id uuid REFERENCES public.boq_items(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  sheet_name text,
  row_index integer,
  cell_ref text,
  status public.exception_status NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_exceptions TO authenticated;
GRANT ALL ON public.extraction_exceptions TO service_role;
ALTER TABLE public.extraction_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY extraction_exceptions_select ON public.extraction_exceptions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY extraction_exceptions_insert ON public.extraction_exceptions FOR INSERT TO authenticated WITH CHECK (public.can_edit_intake(organization_id));
CREATE POLICY extraction_exceptions_update ON public.extraction_exceptions FOR UPDATE TO authenticated USING (public.can_review_technical(organization_id)) WITH CHECK (public.can_review_technical(organization_id));
CREATE POLICY extraction_exceptions_delete ON public.extraction_exceptions FOR DELETE TO authenticated USING (public.can_edit_intake(organization_id));
CREATE TRIGGER trg_extraction_exceptions_updated BEFORE UPDATE ON public.extraction_exceptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_exceptions_tender ON public.extraction_exceptions(tender_id, status);

-- WORKFLOW INSTANCES
CREATE TABLE public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  current_stage public.tender_stage NOT NULL DEFAULT 'intake',
  state public.decision_state NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instances TO authenticated;
GRANT ALL ON public.workflow_instances TO service_role;
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_instances_select ON public.workflow_instances FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY workflow_instances_write ON public.workflow_instances FOR ALL TO authenticated USING (public.can_review_technical(organization_id)) WITH CHECK (public.can_review_technical(organization_id));
CREATE TRIGGER trg_workflow_instances_updated BEFORE UPDATE ON public.workflow_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- APPROVAL TASKS
CREATE TABLE public.approval_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  workflow_instance_id uuid REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  stage public.tender_stage NOT NULL,
  object_type text NOT NULL DEFAULT 'requirements_register',
  object_id uuid,
  object_version integer NOT NULL DEFAULT 1,
  approver_role public.app_role NOT NULL,
  state public.decision_state NOT NULL DEFAULT 'submitted',
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_approval_tasks_active ON public.approval_tasks(tender_id, stage, object_type)
  WHERE state IN ('submitted','in_review','changes_requested');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_tasks TO authenticated;
GRANT ALL ON public.approval_tasks TO service_role;
ALTER TABLE public.approval_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_tasks_select ON public.approval_tasks FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY approval_tasks_insert ON public.approval_tasks FOR INSERT TO authenticated WITH CHECK (public.can_edit_intake(organization_id) AND submitted_by = auth.uid());
CREATE POLICY approval_tasks_update ON public.approval_tasks FOR UPDATE TO authenticated
  USING (
    submitted_by <> auth.uid()
    AND (public.has_org_role(organization_id, 'org_admin'::app_role) OR public.has_org_role(organization_id, approver_role))
  )
  WITH CHECK (
    submitted_by <> auth.uid()
    AND (public.has_org_role(organization_id, 'org_admin'::app_role) OR public.has_org_role(organization_id, approver_role))
  );
CREATE TRIGGER trg_approval_tasks_updated BEFORE UPDATE ON public.approval_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- APPROVAL DECISIONS
CREATE TABLE public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.approval_tasks(id) ON DELETE CASCADE,
  stage public.tender_stage NOT NULL,
  decision public.decision_state NOT NULL,
  note text,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.approval_decisions TO authenticated;
GRANT ALL ON public.approval_decisions TO service_role;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_decisions_select ON public.approval_decisions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY approval_decisions_insert ON public.approval_decisions FOR INSERT TO authenticated
  WITH CHECK (
    decided_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.approval_tasks t
      WHERE t.id = task_id
        AND t.organization_id = approval_decisions.organization_id
        AND t.submitted_by <> auth.uid()
        AND (public.has_org_role(t.organization_id, 'org_admin'::app_role) OR public.has_org_role(t.organization_id, t.approver_role))
    )
  );
