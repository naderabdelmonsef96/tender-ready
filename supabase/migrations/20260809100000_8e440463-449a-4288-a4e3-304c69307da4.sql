-- Catalogue import: upload a supplier price list (Excel/CSV/PDF/Word/photo),
-- extract candidate rows for review, and commit selected rows into the
-- catalogue as new (inactive) SKUs. Nothing here writes to catalogue_products
-- until a human reviews and commits — mirrors the tender-intake pattern.

insert into storage.buckets (id, name, public) values ('catalogue-files', 'catalogue-files', false);

create policy catalogue_files_read on storage.objects for select to authenticated
using (bucket_id = 'catalogue-files' and public.can_manage_catalogue(((storage.foldername(name))[1])::uuid));

create policy catalogue_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'catalogue-files' and public.can_manage_catalogue(((storage.foldername(name))[1])::uuid));

create policy catalogue_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'catalogue-files' and public.can_manage_catalogue(((storage.foldername(name))[1])::uuid));

create table public.catalogue_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalogue_id uuid not null references public.catalogues(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  kind text not null default 'unsupported',
  status text not null default 'uploaded',
  status_message text,
  row_count integer not null default 0,
  committed_count integer not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.catalogue_import_batches to authenticated;
grant all on public.catalogue_import_batches to service_role;
alter table public.catalogue_import_batches enable row level security;
create policy import_batches_all on public.catalogue_import_batches for all to authenticated
  using (public.can_manage_catalogue(organization_id))
  with check (public.can_manage_catalogue(organization_id));
create trigger trg_import_batches_updated before update on public.catalogue_import_batches
  for each row execute function public.set_updated_at();
create index idx_import_batches_org on public.catalogue_import_batches(organization_id, created_at desc);

create table public.catalogue_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid not null references public.catalogue_import_batches(id) on delete cascade,
  row_index integer not null,
  sheet_name text,
  page_number integer,
  supplier_code text,
  name text,
  name_ar text,
  unit text,
  brand text,
  category text,
  price numeric(18,4),
  currency text,
  incoterm text,
  confidence numeric(4,3) not null default 1,
  issue text,
  status text not null default 'pending',
  matched_product_id uuid references public.catalogue_products(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.catalogue_import_rows to authenticated;
grant all on public.catalogue_import_rows to service_role;
alter table public.catalogue_import_rows enable row level security;
create policy import_rows_all on public.catalogue_import_rows for all to authenticated
  using (public.can_manage_catalogue(organization_id))
  with check (public.can_manage_catalogue(organization_id));
create index idx_import_rows_batch on public.catalogue_import_rows(import_batch_id);
