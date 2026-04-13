-- =========================================================================
-- Migration 0001 — post-Excel review adjustments
-- Safe to run whether or not you've already applied schema.sql.
-- =========================================================================

-- 1. clients: allow 'annually', add assistant_staff_id, platform, due_to_tax_manager_note
alter table public.clients drop constraint if exists clients_frequency_check;
alter table public.clients
  add constraint clients_frequency_check
  check (frequency in ('monthly','quarterly','annually'));

alter table public.clients
  add column if not exists assistant_staff_id     uuid references public.profiles(id) on delete set null;

alter table public.clients
  add column if not exists platform               text;

alter table public.clients drop constraint if exists clients_platform_check;
alter table public.clients
  add constraint clients_platform_check
  check (platform is null or platform in ('QBO','QBD','Teamviewer','Other'));

alter table public.clients
  add column if not exists due_to_tax_manager_note text;

create index if not exists clients_assistant_staff_idx
  on public.clients(assistant_staff_id);

-- 2. accounts: add group_label, expand kind, add is_active
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts
  add constraint accounts_kind_check
  check (kind in ('bank','credit_card','loan','investment','trust','payroll','other'));

alter table public.accounts
  add column if not exists group_label text;

alter table public.accounts
  add column if not exists is_active boolean not null default true;

-- 3. account_months: replace is_done boolean with status enum
alter table public.account_months
  add column if not exists status text not null default 'not_started';

alter table public.account_months drop constraint if exists account_months_status_check;
alter table public.account_months
  add constraint account_months_status_check
  check (status in ('not_started','done','missing','closed','not_applicable'));

alter table public.account_months
  add column if not exists note text;

-- Backfill status from legacy is_done column (if it exists) and drop it
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'account_months'
      and column_name  = 'is_done'
  ) then
    update public.account_months
       set status = case when is_done then 'done' else 'not_started' end
     where status = 'not_started';
    alter table public.account_months drop column is_done;
  end if;
end $$;

-- 4. Rebuild the dashboard view to use status + is_active
create or replace view public.dashboard_client_month as
select
  c.id                                      as client_id,
  c.name                                    as client_name,
  c.responsible_staff_id,
  c.assistant_staff_id,
  c.frequency,
  c.complexity,
  c.monthly_fee,
  c.platform,
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
