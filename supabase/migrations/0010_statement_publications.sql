-- 0010: Statement publications + storage — scaffolding for the client-portal
-- (CCH Axcess) integration. This is a DARK feature: nothing here changes existing
-- screens. The frontend UI is gated by VITE_STATEMENTS_ENABLED and the real CCH
-- provider by CCH_ENABLED — both default OFF.
--
-- MANUAL APPLY: run this in the Supabase SQL Editor BEFORE deploying code that
-- reads these objects (per this project's manual-migration workflow).

-- 1. Tracking table -------------------------------------------------------
create table if not exists public.statement_publications (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  period_month    date not null,                 -- normalized to day=01
  status          text not null default 'ready'
                  check (status in ('ready','pending','published','failed')),
  provider        text,                           -- 'mock' | 'cch'
  external_doc_id text,                           -- id returned by the portal
  file_path       text,                           -- path in the 'statements' bucket
  file_name       text,
  error           text,
  published_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, period_month)
);

create index if not exists statement_pub_client_idx
  on public.statement_publications(client_id);

-- Reuse existing helper triggers (day=01 normalization + updated_at bump).
drop trigger if exists trg_statement_pub_first_of_month on public.statement_publications;
create trigger trg_statement_pub_first_of_month
  before insert or update on public.statement_publications
  for each row execute function public.enforce_first_of_month();

drop trigger if exists trg_statement_pub_touch on public.statement_publications;
create trigger trg_statement_pub_touch
  before update on public.statement_publications
  for each row execute function public.touch_updated_at();

-- RLS: any authenticated user (consistent with the rest of the app; the UI
-- enforces who-can-edit via canEdit).
alter table public.statement_publications enable row level security;
drop policy if exists "statement_pub all authed" on public.statement_publications;
create policy "statement_pub all authed"
  on public.statement_publications for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Live status updates across screens, like the other tables.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'statement_publications'
  ) then
    execute 'alter publication supabase_realtime add table public.statement_publications';
  end if;
end $$;

-- 2. Private storage bucket for the statement PDFs ------------------------
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

-- Any authenticated user can read/write statement files (mirrors table RLS).
-- Downloads use short-lived signed URLs from the app.
drop policy if exists "statements read authed" on storage.objects;
create policy "statements read authed"
  on storage.objects for select
  using (bucket_id = 'statements' and auth.uid() is not null);

drop policy if exists "statements insert authed" on storage.objects;
create policy "statements insert authed"
  on storage.objects for insert
  with check (bucket_id = 'statements' and auth.uid() is not null);

drop policy if exists "statements update authed" on storage.objects;
create policy "statements update authed"
  on storage.objects for update
  using (bucket_id = 'statements' and auth.uid() is not null)
  with check (bucket_id = 'statements' and auth.uid() is not null);

drop policy if exists "statements delete authed" on storage.objects;
create policy "statements delete authed"
  on storage.objects for delete
  using (bucket_id = 'statements' and auth.uid() is not null);
