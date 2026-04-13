-- Service catalog and per-client services junction

create table if not exists public.service_types (
  id          text primary key,
  label       text not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.service_types (id, label, sort_order) values
  ('bank_recs',         'Bank Recs',         1),
  ('daily_bk',          'Daily Bookkeeping', 2),
  ('payroll',           'Payroll',           3),
  ('sales_tax',         'Sales Tax',         4),
  ('payroll_tax',       'Payroll Tax',       5),
  ('r_and_a',           'R&A',               6),
  ('cash',              'Cash',              7),
  ('accrual',           'Accrual',           8),
  ('monthly_sales_tax', 'Monthly Sales Tax', 9)
on conflict (id) do nothing;

create table if not exists public.client_services (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  service_id  text not null references public.service_types(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (client_id, service_id)
);

create index if not exists client_services_client_idx on public.client_services(client_id);

alter table public.service_types   enable row level security;
alter table public.client_services enable row level security;

drop policy if exists "service_types read all authed" on public.service_types;
create policy "service_types read all authed"
  on public.service_types for select
  using (auth.uid() is not null);

drop policy if exists "client_services read own or admin" on public.client_services;
create policy "client_services read own or admin"
  on public.client_services for select
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_services.client_id
        and (c.responsible_staff_id = auth.uid() or c.assistant_staff_id = auth.uid())
    )
  );

drop policy if exists "client_services write own or admin" on public.client_services;
create policy "client_services write own or admin"
  on public.client_services for all
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_services.client_id
        and (c.responsible_staff_id = auth.uid() or c.assistant_staff_id = auth.uid())
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_services.client_id
        and (c.responsible_staff_id = auth.uid() or c.assistant_staff_id = auth.uid())
    )
  );

drop trigger if exists trg_audit_client_services on public.client_services;
create trigger trg_audit_client_services
  after insert or update or delete on public.client_services
  for each row execute function public.audit_row_change();
