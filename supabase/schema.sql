-- =========================================================================
-- BookTracker — Bookkeeping Client Tracker schema
-- Run this in the Supabase SQL Editor (one-shot).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =========================================================================

-- ---------- Extensions ---------------------------------------------------
create extension if not exists "pgcrypto";

-- =========================================================================
-- 1. Profiles  (one row per auth.users)
-- =========================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  email         text not null default '',
  role          text not null default 'employee' check (role in ('employee','admin')),
  must_change_password boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================================
-- 2. Clients
-- =========================================================================
create table if not exists public.clients (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  responsible_staff_id    uuid references public.profiles(id) on delete set null,
  assistant_staff_id      uuid references public.profiles(id) on delete set null,
  due_to_tax_manager_day  int  check (due_to_tax_manager_day between 1 and 31),
  due_to_tax_manager_note text,
  monthly_fee             numeric(10,2) not null default 0,
  complexity              int  not null default 1 check (complexity between 1 and 3),
  frequency               text not null default 'monthly'
                          check (frequency in ('monthly','quarterly','annually')),
  platform                text check (platform is null or platform in ('QBO','QBD','Teamviewer','Other')),
  notes                   text,
  emails                  text,   -- comma-separated client contact emails
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists clients_responsible_staff_idx
  on public.clients(responsible_staff_id);
create index if not exists clients_assistant_staff_idx
  on public.clients(assistant_staff_id);

-- =========================================================================
-- 3. Accounts per client
-- =========================================================================
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,                         -- e.g. "CCU Checking", "Seacoast X2701"
  kind        text not null default 'bank' check (kind in ('bank','credit_card','loan','investment','trust','payroll','other')),
  group_label text,                                  -- optional visual grouping: 'Operating Accounts', 'Trust Accounts', 'Credit Cards'
  sort_order  int  not null default 0,
  is_active   boolean not null default true,         -- false = closed
  created_at  timestamptz not null default now()
);

create index if not exists accounts_client_idx on public.accounts(client_id);

-- =========================================================================
-- 4. Monthly completion per account
-- period_month is stored as the first day of the month (date).
-- =========================================================================
create table if not exists public.account_months (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  period_month    date not null,                    -- always day=01
  status          text not null default 'not_started'
                  check (status in ('not_started','done','missing','closed','not_applicable')),
  completed_by    uuid references public.profiles(id) on delete set null,
  completed_at    timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id, period_month)
);

create index if not exists account_months_period_idx
  on public.account_months(period_month);
create index if not exists account_months_account_idx
  on public.account_months(account_id);

-- Enforce day=01 on period_month
create or replace function public.enforce_first_of_month()
returns trigger language plpgsql as $$
begin
  new.period_month := date_trunc('month', new.period_month)::date;
  return new;
end;
$$;

drop trigger if exists trg_account_months_first_of_month on public.account_months;
create trigger trg_account_months_first_of_month
  before insert or update on public.account_months
  for each row execute function public.enforce_first_of_month();

-- =========================================================================
-- 5. Per-client monthly summary (WIP, Time, FS printed, etc.)
-- =========================================================================
create table if not exists public.client_months (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  period_month      date not null,
  total_wip         numeric(12,2) not null default 0,   -- dollars
  total_time_hours  numeric(10,2) not null default 0,   -- hours
  monthly_fee       numeric(10,2) not null default 0,   -- snapshot of the fee for this month
  fs_printed        boolean not null default false,     -- Monthly F.S.s printed?
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, period_month)
);

create index if not exists client_months_period_idx
  on public.client_months(period_month);

drop trigger if exists trg_client_months_first_of_month on public.client_months;
create trigger trg_client_months_first_of_month
  before insert or update on public.client_months
  for each row execute function public.enforce_first_of_month();

-- =========================================================================
-- 6. Generic updated_at bump
-- =========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_account_months_touch on public.account_months;
create trigger trg_account_months_touch before update on public.account_months
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_client_months_touch on public.client_months;
create trigger trg_client_months_touch before update on public.client_months
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- 7. AUDIT LOG (append-only)
-- =========================================================================
create table if not exists public.audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_email   text,                                   -- frozen at write time
  action        text not null,                          -- e.g. 'login','account_month.check','client.update'
  entity_type   text,                                   -- 'client','account','account_month','client_month','auth'
  entity_id     text,                                   -- flexible id (uuid or composite key)
  client_id     uuid references public.clients(id) on delete set null,
  field         text,                                   -- which field changed (nullable)
  old_value     jsonb,
  new_value     jsonb,
  metadata      jsonb,                                  -- device/browser/ip for logins, etc.
  constraint audit_action_not_blank check (length(action) > 0)
);

create index if not exists audit_log_actor_idx     on public.audit_log(actor_id);
create index if not exists audit_log_client_idx    on public.audit_log(client_id);
create index if not exists audit_log_action_idx    on public.audit_log(action);
create index if not exists audit_log_occurred_idx  on public.audit_log(occurred_at desc);

-- Append-only enforcement: block UPDATE and DELETE at the trigger level
-- so nothing (not even superuser roles routed through PostgREST) can mutate history.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists trg_audit_log_no_update on public.audit_log;
create trigger trg_audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists trg_audit_log_no_delete on public.audit_log;
create trigger trg_audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- =========================================================================
-- 8. Server-side audit triggers for clients / accounts / account_months / client_months
--    The frontend ALSO logs actions (for login + richer metadata), but these
--    triggers guarantee that any DB write produces an audit record.
-- =========================================================================
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_action text;
  v_client uuid;
begin
  select email into v_email from public.profiles where id = v_actor;

  if tg_op = 'INSERT' then
    v_action := tg_table_name || '.insert';
  elsif tg_op = 'UPDATE' then
    v_action := tg_table_name || '.update';
  else
    v_action := tg_table_name || '.delete';
  end if;

  -- derive client_id for filtering convenience
  if tg_table_name = 'clients' then
    v_client := coalesce((new).id, (old).id);
  elsif tg_table_name = 'accounts' then
    v_client := coalesce((new).client_id, (old).client_id);
  elsif tg_table_name = 'client_months' then
    v_client := coalesce((new).client_id, (old).client_id);
  elsif tg_table_name = 'account_months' then
    select a.client_id into v_client
      from public.accounts a
     where a.id = coalesce((new).account_id, (old).account_id);
  end if;

  insert into public.audit_log (
    actor_id, actor_email, action, entity_type, entity_id,
    client_id, old_value, new_value
  ) values (
    v_actor, v_email, v_action, tg_table_name,
    coalesce((new).id::text, (old).id::text),
    v_client,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_clients        on public.clients;
create trigger trg_audit_clients
  after insert or update or delete on public.clients
  for each row execute function public.audit_row_change();

drop trigger if exists trg_audit_accounts       on public.accounts;
create trigger trg_audit_accounts
  after insert or update or delete on public.accounts
  for each row execute function public.audit_row_change();

drop trigger if exists trg_audit_account_months on public.account_months;
create trigger trg_audit_account_months
  after insert or update or delete on public.account_months
  for each row execute function public.audit_row_change();

drop trigger if exists trg_audit_client_months  on public.client_months;
create trigger trg_audit_client_months
  after insert or update or delete on public.client_months
  for each row execute function public.audit_row_change();

-- =========================================================================
-- 9. Row Level Security
-- =========================================================================
alter table public.profiles       enable row level security;
alter table public.clients        enable row level security;
alter table public.accounts       enable row level security;
alter table public.account_months enable row level security;
alter table public.client_months  enable row level security;
alter table public.audit_log      enable row level security;

-- ---- profiles -----------------------------------------------------------
drop policy if exists "profiles self read"  on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert"
  on public.profiles for insert
  with check (public.is_admin() or id = auth.uid());

-- ---- clients ------------------------------------------------------------
drop policy if exists "clients read own or admin" on public.clients;
create policy "clients read own or admin"
  on public.clients for select
  using (responsible_staff_id = auth.uid() or public.is_admin());

drop policy if exists "clients write own or admin" on public.clients;
create policy "clients write own or admin"
  on public.clients for update
  using (responsible_staff_id = auth.uid() or public.is_admin())
  with check (responsible_staff_id = auth.uid() or public.is_admin());

drop policy if exists "clients insert admin" on public.clients;
create policy "clients insert admin"
  on public.clients for insert
  with check (public.is_admin());

drop policy if exists "clients delete admin" on public.clients;
create policy "clients delete admin"
  on public.clients for delete
  using (public.is_admin());

-- ---- accounts -----------------------------------------------------------
drop policy if exists "accounts read own or admin" on public.accounts;
create policy "accounts read own or admin"
  on public.accounts for select
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = accounts.client_id and c.responsible_staff_id = auth.uid()
    )
  );

drop policy if exists "accounts write own or admin" on public.accounts;
create policy "accounts write own or admin"
  on public.accounts for all
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = accounts.client_id and c.responsible_staff_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = accounts.client_id and c.responsible_staff_id = auth.uid()
    )
  );

-- ---- account_months -----------------------------------------------------
drop policy if exists "account_months read own or admin" on public.account_months;
create policy "account_months read own or admin"
  on public.account_months for select
  using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      join public.clients c on c.id = a.client_id
      where a.id = account_months.account_id and c.responsible_staff_id = auth.uid()
    )
  );

drop policy if exists "account_months write own or admin" on public.account_months;
create policy "account_months write own or admin"
  on public.account_months for all
  using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      join public.clients c on c.id = a.client_id
      where a.id = account_months.account_id and c.responsible_staff_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      join public.clients c on c.id = a.client_id
      where a.id = account_months.account_id and c.responsible_staff_id = auth.uid()
    )
  );

-- ---- client_months ------------------------------------------------------
drop policy if exists "client_months read own or admin" on public.client_months;
create policy "client_months read own or admin"
  on public.client_months for select
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_months.client_id and c.responsible_staff_id = auth.uid()
    )
  );

drop policy if exists "client_months write own or admin" on public.client_months;
create policy "client_months write own or admin"
  on public.client_months for all
  using (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_months.client_id and c.responsible_staff_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.clients c
      where c.id = client_months.client_id and c.responsible_staff_id = auth.uid()
    )
  );

-- ---- audit_log ----------------------------------------------------------
-- Everyone authenticated can INSERT (frontend logs logins etc.),
-- but SELECT is limited: users see their own activity; admins see everything.
-- UPDATE/DELETE are blocked by the immutable trigger above.
drop policy if exists "audit read self or admin" on public.audit_log;
create policy "audit read self or admin"
  on public.audit_log for select
  using (actor_id = auth.uid() or public.is_admin());

drop policy if exists "audit insert any authed" on public.audit_log;
create policy "audit insert any authed"
  on public.audit_log for insert
  with check (auth.uid() is not null);

-- =========================================================================
-- 10. Convenience view: dashboard_client_month
-- One row per (client, period_month) with completion counts.
-- =========================================================================
create or replace view public.dashboard_client_month as
select
  c.id                                      as client_id,
  c.name                                    as client_name,
  c.responsible_staff_id,
  c.frequency,
  c.complexity,
  c.monthly_fee,
  cm.period_month,
  cm.total_wip,
  cm.total_time_hours,
  cm.fs_printed,
  coalesce(am_counts.total_accounts,   0)   as total_accounts,
  coalesce(am_counts.done_accounts,    0)   as done_accounts,
  coalesce(am_counts.missing_accounts, 0)   as missing_accounts
from public.clients c
left join public.client_months cm
  on cm.client_id = c.id
left join lateral (
  select
    count(*) filter (where a.is_active)                          as total_accounts,
    count(*) filter (where a.is_active and am.status = 'done')   as done_accounts,
    count(*) filter (where a.is_active and am.status = 'missing') as missing_accounts
  from public.accounts a
  left join public.account_months am
    on am.account_id = a.id and am.period_month = cm.period_month
  where a.client_id = c.id
) am_counts on true;

-- =========================================================================
-- Done.
-- Remember: promote your first admin user manually with
--   update public.profiles set role = 'admin' where email = 'you@firm.com';
-- =========================================================================
