-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'org_admin','proposal_engineer','technical_lead','product_manager',
  'sourcing_manager','commercial_manager','finance_manager','signatory','viewer'
);
CREATE TYPE public.membership_status AS ENUM ('invited','active','suspended');
CREATE TYPE public.tender_stage AS ENUM ('intake','technical','product','sourcing','commercial','finance','release');
CREATE TYPE public.decision_state AS ENUM ('draft','submitted','in_review','changes_requested','approved','rejected','superseded','released');
CREATE TYPE public.tender_status AS ENUM ('open','won','lost','cancelled','archived');

-- ============ SHARED TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  full_name_ar TEXT,
  job_title TEXT,
  phone TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  slug TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT 'EG',
  base_currency TEXT NOT NULL DEFAULT 'EGP',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MEMBERSHIPS ============
CREATE TABLE public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT,
  role public.app_role NOT NULL DEFAULT 'viewer',
  status public.membership_status NOT NULL DEFAULT 'invited',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT membership_identity CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);
CREATE UNIQUE INDEX uq_membership_user_org ON public.organization_memberships (organization_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_membership_invite_org ON public.organization_memberships (organization_id, lower(invited_email)) WHERE user_id IS NULL;
CREATE INDEX idx_membership_user ON public.organization_memberships (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_memberships TO authenticated;
GRANT ALL ON public.organization_memberships TO service_role;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = _org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_org_role(_org UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = _org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = ANY(_roles)
  );
$$;

-- ============ POLICIES: profiles ============
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_select_org_peers ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_memberships mine
  JOIN public.organization_memberships theirs ON theirs.organization_id = mine.organization_id
  WHERE mine.user_id = auth.uid() AND mine.status = 'active'
    AND theirs.user_id = public.profiles.id AND theirs.status = 'active'
));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ============ POLICIES: organizations ============
CREATE POLICY orgs_select_member ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY orgs_update_admin ON public.organizations FOR UPDATE TO authenticated
USING (public.has_org_role(id, 'org_admin')) WITH CHECK (public.has_org_role(id, 'org_admin'));

-- ============ POLICIES: memberships ============
CREATE POLICY memberships_select_self ON public.organization_memberships FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY memberships_select_org ON public.organization_memberships FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY memberships_admin_insert ON public.organization_memberships FOR INSERT TO authenticated
WITH CHECK (public.has_org_role(organization_id, 'org_admin'));
CREATE POLICY memberships_admin_update ON public.organization_memberships FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, 'org_admin'))
WITH CHECK (public.has_org_role(organization_id, 'org_admin') AND NOT (user_id = auth.uid() AND role <> 'org_admin'));
CREATE POLICY memberships_admin_delete ON public.organization_memberships FOR DELETE TO authenticated
USING (public.has_org_role(organization_id, 'org_admin') AND user_id IS DISTINCT FROM auth.uid());

-- ============ COMPANY SETTINGS ============
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  legal_name_ar TEXT,
  tax_number TEXT,
  commercial_registration TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'EG',
  phone TEXT,
  email TEXT,
  website TEXT,
  bank_details TEXT,
  quotation_number_pattern TEXT NOT NULL DEFAULT 'QT-{YYYY}-{SEQ:4}',
  quotation_validity_days INTEGER NOT NULL DEFAULT 30 CHECK (quotation_validity_days > 0),
  default_terms TEXT,
  footer_text TEXT,
  signature_block TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_company_settings_updated BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY company_settings_insert ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, 'org_admin'));
CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, 'org_admin')) WITH CHECK (public.has_org_role(organization_id, 'org_admin'));

-- ============ FEATURE FLAGS ============
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, flag_key)
);
GRANT SELECT, INSERT, UPDATE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_feature_flags_updated BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY flags_select ON public.feature_flags FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY flags_admin_write ON public.feature_flags FOR ALL TO authenticated
USING (public.has_org_role(organization_id, 'org_admin')) WITH CHECK (public.has_org_role(organization_id, 'org_admin'));

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  country TEXT NOT NULL DEFAULT 'EG',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_org ON public.clients (organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY clients_write ON public.clients FOR ALL TO authenticated
USING (public.has_any_org_role(organization_id, ARRAY['org_admin','proposal_engineer']::public.app_role[]))
WITH CHECK (public.has_any_org_role(organization_id, ARRAY['org_admin','proposal_engineer']::public.app_role[]));

-- ============ TENDERS ============
CREATE TABLE public.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  title_ar TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  project_location TEXT,
  submission_deadline TIMESTAMPTZ,
  currency TEXT NOT NULL DEFAULT 'EGP',
  estimated_value NUMERIC(18,4),
  current_stage public.tender_stage NOT NULL DEFAULT 'intake',
  stage_state public.decision_state NOT NULL DEFAULT 'draft',
  status public.tender_status NOT NULL DEFAULT 'open',
  notes TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference)
);
CREATE INDEX idx_tenders_org_stage ON public.tenders (organization_id, current_stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenders TO authenticated;
GRANT ALL ON public.tenders TO service_role;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenders_updated BEFORE UPDATE ON public.tenders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY tenders_select ON public.tenders FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY tenders_insert ON public.tenders FOR INSERT TO authenticated
WITH CHECK (public.has_any_org_role(organization_id, ARRAY['org_admin','proposal_engineer']::public.app_role[]));
CREATE POLICY tenders_update ON public.tenders FOR UPDATE TO authenticated
USING (public.has_any_org_role(organization_id, ARRAY['org_admin','proposal_engineer','technical_lead','product_manager','sourcing_manager','commercial_manager','finance_manager','signatory']::public.app_role[]))
WITH CHECK (public.has_any_org_role(organization_id, ARRAY['org_admin','proposal_engineer','technical_lead','product_manager','sourcing_manager','commercial_manager','finance_manager','signatory']::public.app_role[]));
CREATE POLICY tenders_delete ON public.tenders FOR DELETE TO authenticated USING (public.has_org_role(organization_id, 'org_admin'));

-- ============ WORKFLOW TEMPLATES / STAGES ============
CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version)
);
GRANT SELECT ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wf_templates_updated BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY wf_templates_select ON public.workflow_templates FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE TABLE public.workflow_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  stage public.tender_stage NOT NULL,
  stage_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  approver_role public.app_role NOT NULL,
  sla_hours INTEGER,
  requires_note_on_reject BOOLEAN NOT NULL DEFAULT true,
  blocks_release BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, stage),
  UNIQUE (template_id, stage_order)
);
GRANT SELECT ON public.workflow_stages TO authenticated;
GRANT ALL ON public.workflow_stages TO service_role;
ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wf_stages_updated BEFORE UPDATE ON public.workflow_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY wf_stages_select ON public.workflow_stages FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications (user_id, read_at);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ AUDIT EVENTS (append only) ============
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  object_version INTEGER,
  is_material BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON public.audit_events (organization_id, created_at DESC);
CREATE INDEX idx_audit_object ON public.audit_events (object_type, object_id);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select_member ON public.audit_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY audit_insert_member ON public.audit_events FOR INSERT TO authenticated
WITH CHECK (public.is_org_member(organization_id) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- ============ SIGNUP HANDLER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pilot_org UUID := '11111111-1111-4111-8111-111111111111';
  linked INTEGER := 0;
  admin_count INTEGER := 0;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.organization_memberships
     SET user_id = NEW.id, status = 'active', invited_email = NULL
   WHERE user_id IS NULL AND lower(invited_email) = lower(NEW.email);
  GET DIAGNOSTICS linked = ROW_COUNT;

  IF linked = 0 THEN
    SELECT count(*) INTO admin_count
      FROM public.organization_memberships
     WHERE organization_id = pilot_org AND role = 'org_admin' AND status = 'active';
    IF admin_count = 0 AND EXISTS (SELECT 1 FROM public.organizations WHERE id = pilot_org) THEN
      INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
      VALUES (pilot_org, NEW.id, 'org_admin', 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED: PILOT ORGANIZATION ============
INSERT INTO public.organizations (id, name, name_ar, slug, country, base_currency)
VALUES ('11111111-1111-4111-8111-111111111111', 'Elevate Engineering', 'إليفيت للهندسة', 'elevate-engineering', 'EG', 'EGP');

INSERT INTO public.company_settings (organization_id, legal_name, legal_name_ar, tax_number, commercial_registration,
  address_line1, city, country, phone, email, website, bank_details, quotation_validity_days, default_terms, footer_text, signature_block)
VALUES ('11111111-1111-4111-8111-111111111111', 'Elevate Engineering & Contracting S.A.E.', 'إليفيت للهندسة والمقاولات ش.م.م',
  '200-345-678', 'CR-84512', '12 El Nasr Road, Nasr City', 'Cairo', 'EG', '+20 2 2401 5566',
  'tenders@elevate-eng.example', 'www.elevate-eng.example',
  'Bank: CIB — Nasr City Branch | IBAN: EG380003000512345678901234567 | SWIFT: CIBEEGCX',
  30,
  'Prices are quoted in EGP and exclude VAT unless stated. Delivery as per agreed schedule after receipt of purchase order.',
  'Elevate Engineering & Contracting S.A.E. — Cairo, Egypt', 'Authorized Signatory / General Manager');

INSERT INTO public.feature_flags (organization_id, flag_key, enabled, description)
VALUES ('11111111-1111-4111-8111-111111111111', 'roadmap_features', false, 'Advanced SLA analytics, delegation intelligence and the versioned workflow editor');

INSERT INTO public.clients (id, organization_id, name, name_ar, contact_person, email, phone, address, country)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Silver Sands Development',
  'تطوير سيلفر ساندز', 'Eng. Karim Fouad', 'procurement@silversands.example', '+20 10 2233 4455',
  'Silver Sands Resort, North Coast', 'EG');

INSERT INTO public.tenders (id, organization_id, reference, title, title_ar, client_id, project_location,
  submission_deadline, currency, estimated_value, current_stage, stage_state, status)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'TND-2026-001',
  'Elevate Gym at Silver Sands — Tender BOQ REV.06', 'صالة إليفيت الرياضية في سيلفر ساندز — جدول كميات مراجعة 06',
  '22222222-2222-4222-8222-222222222222', 'Silver Sands, North Coast, Egypt',
  now() + interval '21 days', 'EGP', 4850000.0000, 'intake', 'draft', 'open');

INSERT INTO public.workflow_templates (id, organization_id, name, name_ar, description)
VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
  'Standard Tender Governance', 'حوكمة العطاءات القياسية', 'Seven-stage maker-checker governance from intake to release');

INSERT INTO public.workflow_stages (organization_id, template_id, stage, stage_order, name, name_ar, approver_role, sla_hours)
VALUES
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','intake',1,'Intake','الاستلام','proposal_engineer',24),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','technical',2,'Technical Review','المراجعة الفنية','technical_lead',48),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','product',3,'Portfolio Match','مطابقة المنتجات','product_manager',48),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','sourcing',4,'Supply Route','مسار التوريد','sourcing_manager',72),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','commercial',5,'Commercial','التجاري','commercial_manager',48),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','finance',6,'Finance','المالية','finance_manager',24),
 ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','release',7,'Release','الإصدار','signatory',24);