-- 0011: Per-client User Notes + @mention unread tracking.
-- A discussion thread on each client (separate from the free-text `clients.notes`
-- field used in the Edit Client modal, which this does NOT touch). Any authed user
-- can post; `@Full Name` in the body tags a specific person and creates a
-- note_mentions row so that person's unread badge (top bar + per-client) lights up.
--
-- MANUAL APPLY: run this in the Supabase SQL Editor BEFORE deploying code that
-- reads these objects (per this project's manual-migration workflow).

create table public.client_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  author_id  uuid not null references public.profiles(id),
  body       text not null,
  created_at timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes(client_id);

create table public.note_mentions (
  id                 uuid primary key default gen_random_uuid(),
  note_id            uuid not null references public.client_notes(id) on delete cascade,
  mentioned_user_id  uuid not null references public.profiles(id) on delete cascade,
  read_at            timestamptz
);

create index note_mentions_unread_idx
  on public.note_mentions(mentioned_user_id)
  where read_at is null;

-- RLS: client_notes is a visible-to-all append-only log (like audit_log, but not
-- admin-only — every user is meant to see the discussion). note_mentions is each
-- user's own read-state: anyone can create a mention row (tagging someone else
-- when posting a note), but only the tagged user can see/clear their own rows.
alter table public.client_notes enable row level security;
create policy "client_notes read all authed"
  on public.client_notes for select
  using (auth.uid() is not null);
create policy "client_notes insert all authed"
  on public.client_notes for insert
  with check (auth.uid() is not null);

alter table public.note_mentions enable row level security;
create policy "note_mentions select own"
  on public.note_mentions for select
  using (mentioned_user_id = auth.uid());
create policy "note_mentions insert all authed"
  on public.note_mentions for insert
  with check (auth.uid() is not null);
create policy "note_mentions update own"
  on public.note_mentions for update
  using (mentioned_user_id = auth.uid())
  with check (mentioned_user_id = auth.uid());

-- Live updates: new notes/mentions push to open screens instantly.
do $$
declare t text;
begin
  foreach t in array array['client_notes', 'note_mentions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
