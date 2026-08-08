-- Enums
CREATE TYPE public.match_state AS ENUM ('unmatched','suggested','confirmed','out_of_portfolio');
CREATE TYPE public.supply_route AS ENUM ('ex_stock','import','local_supplier','foreign_rfq');
CREATE TYPE public.supplier_kind AS ENUM ('local','foreign');

-- Role helpers
CREATE OR REPLACE FUNCTION public.can_decide_match(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','proposal_engineer','product_manager']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_decide_match(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_decide_sourcing(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','proposal_engineer','sourcing_manager']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_decide_sourcing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_catalogue(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_org_role(_org, ARRAY['org_admin','product_manager']::app_role[]);
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_catalogue(uuid) TO authenticated;

-- Catalogues
CREATE TABLE public.catalogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogues TO authenticated;
GRANT ALL ON public.catalogues TO service_role;
ALTER TABLE public.catalogues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogues_read" ON public.catalogues FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "catalogues_write" ON public.catalogues FOR ALL TO authenticated USING (public.can_manage_catalogue(organization_id)) WITH CHECK (public.can_manage_catalogue(organization_id));
CREATE TRIGGER trg_catalogues_updated BEFORE UPDATE ON public.catalogues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.catalogue_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  catalogue_id uuid NOT NULL REFERENCES public.catalogues(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  unit text,
  brand text,
  category text,
  base_cost numeric(18,4),
  currency text NOT NULL DEFAULT 'EGP',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_products TO authenticated;
GRANT ALL ON public.catalogue_products TO service_role;
ALTER TABLE public.catalogue_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read" ON public.catalogue_products FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "products_write" ON public.catalogue_products FOR ALL TO authenticated USING (public.can_manage_catalogue(organization_id)) WITH CHECK (public.can_manage_catalogue(organization_id));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.catalogue_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_org ON public.catalogue_products(organization_id, is_active);

CREATE TABLE public.product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.catalogue_products(id) ON DELETE CASCADE,
  spec_key text NOT NULL,
  spec_value text NOT NULL,
  unit text,
  normalized_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, spec_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_specifications TO authenticated;
GRANT ALL ON public.product_specifications TO service_role;
ALTER TABLE public.product_specifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "specs_read" ON public.product_specifications FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "specs_write" ON public.product_specifications FOR ALL TO authenticated USING (public.can_manage_catalogue(organization_id)) WITH CHECK (public.can_manage_catalogue(organization_id));
CREATE TRIGGER trg_specs_updated BEFORE UPDATE ON public.product_specifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.catalogue_products(id) ON DELETE CASCADE,
  warehouse text NOT NULL DEFAULT 'main',
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_positions TO authenticated;
GRANT ALL ON public.stock_positions TO service_role;
ALTER TABLE public.stock_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_read" ON public.stock_positions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "stock_write" ON public.stock_positions FOR ALL TO authenticated USING (public.can_manage_catalogue(organization_id)) WITH CHECK (public.can_manage_catalogue(organization_id));
CREATE TRIGGER trg_stock_updated BEFORE UPDATE ON public.stock_positions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Portfolio matches
CREATE TABLE public.portfolio_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  boq_item_id uuid NOT NULL REFERENCES public.boq_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.catalogue_products(id) ON DELETE SET NULL,
  state public.match_state NOT NULL DEFAULT 'unmatched',
  score numeric(6,4),
  matched_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  override_reason text,
  note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_matches TO authenticated;
GRANT ALL ON public.portfolio_matches TO service_role;
ALTER TABLE public.portfolio_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_read" ON public.portfolio_matches FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "matches_write" ON public.portfolio_matches FOR ALL TO authenticated USING (public.can_decide_match(organization_id)) WITH CHECK (public.can_decide_match(organization_id));
CREATE TRIGGER trg_matches_updated BEFORE UPDATE ON public.portfolio_matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_matches_tender ON public.portfolio_matches(tender_id);

-- Suppliers and quotes
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  kind public.supplier_kind NOT NULL DEFAULT 'local',
  country text,
  contact_person text,
  email text,
  phone text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_read" ON public.suppliers FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated USING (public.can_decide_sourcing(organization_id)) WITH CHECK (public.can_decide_sourcing(organization_id));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  boq_item_id uuid NOT NULL REFERENCES public.boq_items(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  kind public.supplier_kind NOT NULL DEFAULT 'local',
  currency text NOT NULL DEFAULT 'EGP',
  unit_cost numeric(18,4),
  incoterm text,
  lead_time_days integer,
  valid_until date,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_quotes TO authenticated;
GRANT ALL ON public.supplier_quotes TO service_role;
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_read" ON public.supplier_quotes FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "quotes_write" ON public.supplier_quotes FOR ALL TO authenticated USING (public.can_decide_sourcing(organization_id)) WITH CHECK (public.can_decide_sourcing(organization_id));
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.supplier_quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_quotes_item ON public.supplier_quotes(boq_item_id);

CREATE TABLE public.sourcing_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  boq_item_id uuid NOT NULL REFERENCES public.boq_items(id) ON DELETE CASCADE,
  route public.supply_route NOT NULL,
  product_id uuid REFERENCES public.catalogue_products(id) ON DELETE SET NULL,
  supplier_quote_id uuid REFERENCES public.supplier_quotes(id) ON DELETE SET NULL,
  warehouse text,
  origin_country text,
  incoterm text,
  lead_time_days integer,
  note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourcing_routes TO authenticated;
GRANT ALL ON public.sourcing_routes TO service_role;
ALTER TABLE public.sourcing_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_read" ON public.sourcing_routes FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "routes_write" ON public.sourcing_routes FOR ALL TO authenticated USING (public.can_decide_sourcing(organization_id)) WITH CHECK (public.can_decide_sourcing(organization_id));
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.sourcing_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_routes_tender ON public.sourcing_routes(tender_id);

-- Starter catalogue for the pilot organization
INSERT INTO public.catalogues (id, organization_id, name, name_ar, description)
SELECT '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Main catalogue', 'الكتالوج الرئيسي', 'Starter portfolio for the pilot organization.'
WHERE EXISTS (SELECT 1 FROM public.organizations WHERE id = '11111111-1111-4111-8111-111111111111');

INSERT INTO public.catalogue_products (organization_id, catalogue_id, code, name, name_ar, unit, brand, category, base_cost, currency)
SELECT '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', v.code, v.name, v.name_ar, v.unit, v.brand, v.category, v.cost, 'EGP'
FROM (VALUES
  ('TR-PMP-050','Centrifugal water pump 5 HP','مضخة مياه طاردة مركزية 5 حصان','no','Grundfos','pumps',48500.0000),
  ('TR-AHU-100','Air handling unit 10,000 CFM','وحدة مناولة هواء 10000 قدم مكعب','no','Carrier','hvac',312000.0000),
  ('TR-PIP-100','Galvanised steel pipe 100 mm','ماسورة صلب مجلفن 100 مم','m','Ezz Steel','piping',940.0000),
  ('TR-CBL-4C16','Power cable 4C x 16 mm2','كابل قوى 4×16 مم²','m','Elsewedy','electrical',420.0000),
  ('TR-LED-036','LED panel light 36 W','لوحة إضاءة ليد 36 وات','no','Philips','lighting',1150.0000),
  ('TR-FAN-EX3','Inline exhaust fan 3,000 CFM','مروحة طرد هواء 3000 قدم مكعب','no','Systemair','hvac',26800.0000)
) AS v(code,name,name_ar,unit,brand,category,cost)
WHERE EXISTS (SELECT 1 FROM public.catalogues WHERE id = '22222222-2222-4222-8222-222222222222');

INSERT INTO public.product_specifications (organization_id, product_id, spec_key, spec_value, unit, normalized_value)
SELECT p.organization_id, p.id, s.spec_key, s.spec_value, s.unit, lower(s.spec_value)
FROM public.catalogue_products p
JOIN (VALUES
  ('TR-PMP-050','power','5','hp'),
  ('TR-PMP-050','standard','ISO 9906',NULL),
  ('TR-AHU-100','airflow','10000','cfm'),
  ('TR-AHU-100','standard','AHRI 430',NULL),
  ('TR-PIP-100','diameter','100','mm'),
  ('TR-CBL-4C16','cross_section','16','mm2'),
  ('TR-LED-036','power','36','w'),
  ('TR-FAN-EX3','airflow','3000','cfm')
) AS s(code,spec_key,spec_value,unit) ON s.code = p.code
WHERE p.organization_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.stock_positions (organization_id, product_id, warehouse, quantity, lead_time_days)
SELECT p.organization_id, p.id, 'main', v.qty, v.lead
FROM public.catalogue_products p
JOIN (VALUES
  ('TR-PMP-050',4,0),
  ('TR-AHU-100',0,60),
  ('TR-PIP-100',1200,0),
  ('TR-CBL-4C16',3000,0),
  ('TR-LED-036',260,0),
  ('TR-FAN-EX3',0,45)
) AS v(code,qty,lead) ON v.code = p.code
WHERE p.organization_id = '11111111-1111-4111-8111-111111111111';