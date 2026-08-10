-- Phase 4: Pricing Builder, Commercial Review & Quotation.
-- Stages 'commercial'/'finance'/'release' were already seeded (see
-- workflow_stages) since Phase 1 — this migration only adds the tables the
-- new screens read/write. Governance itself (approval_tasks,
-- decideStageApproval, NEXT_STAGE) needs no schema change.

CREATE OR REPLACE FUNCTION public.can_decide_pricing(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','proposal_engineer','commercial_manager']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_decide_pricing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_decide_finance(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','finance_manager']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_decide_finance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_release_quotation(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','signatory']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_release_quotation(uuid) TO authenticated;

-- One priced line per BOQ item. Cost basis is always read from an existing
-- source (landing cost or accepted supplier quote), never typed — only
-- margin_percent is a human input.
CREATE TABLE public.pricing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  boq_item_id uuid NOT NULL REFERENCES public.boq_items(id) ON DELETE CASCADE,
  cost_basis numeric(18,4) NOT NULL,
  cost_basis_currency text NOT NULL,
  cost_basis_source text NOT NULL CHECK (cost_basis_source IN ('landing_cost','supplier_quote')),
  margin_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (margin_percent >= 0),
  margin_basis text NOT NULL DEFAULT 'cost' CHECK (margin_basis = 'cost'),
  unit_price numeric(18,4) NOT NULL,
  unit_price_currency text NOT NULL,
  total_price numeric(18,4) NOT NULL,
  note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_lines TO authenticated;
GRANT ALL ON public.pricing_lines TO service_role;
ALTER TABLE public.pricing_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_lines_read ON public.pricing_lines FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY pricing_lines_write ON public.pricing_lines FOR ALL TO authenticated USING (public.can_decide_pricing(organization_id)) WITH CHECK (public.can_decide_pricing(organization_id));
CREATE TRIGGER trg_pricing_lines_updated BEFORE UPDATE ON public.pricing_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pricing_lines_tender ON public.pricing_lines(organization_id, tender_id);

-- One row per released quotation. FX rates used are frozen here at release
-- time — a released quotation must never silently re-price if a rate moves.
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  quotation_number text NOT NULL,
  currency text NOT NULL,
  fx_rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(18,4) NOT NULL,
  vat_amount numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released')),
  released_by uuid REFERENCES auth.users(id),
  released_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quotation_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_read ON public.quotations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY quotations_write ON public.quotations FOR ALL TO authenticated USING (public.can_release_quotation(organization_id)) WITH CHECK (public.can_release_quotation(organization_id));
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_quotations_tender ON public.quotations(organization_id, tender_id);

CREATE TABLE public.quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  boq_item_id uuid NOT NULL REFERENCES public.boq_items(id) ON DELETE CASCADE,
  pricing_line_id uuid REFERENCES public.pricing_lines(id) ON DELETE SET NULL,
  description text NOT NULL,
  description_ar text,
  unit text,
  quantity numeric(18,4),
  unit_price numeric(18,4) NOT NULL,
  total_price numeric(18,4) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_lines TO authenticated;
GRANT ALL ON public.quotation_lines TO service_role;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotation_lines_read ON public.quotation_lines FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY quotation_lines_write ON public.quotation_lines FOR ALL TO authenticated USING (public.can_release_quotation(organization_id)) WITH CHECK (public.can_release_quotation(organization_id));
CREATE INDEX idx_quotation_lines_quotation ON public.quotation_lines(quotation_id);