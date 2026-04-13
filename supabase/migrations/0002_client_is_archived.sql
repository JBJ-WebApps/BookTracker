-- Adds the is_archived flag used to hide clients from the sidebar when they leave.
alter table public.clients
  add column if not exists is_archived boolean not null default false;

create index if not exists clients_not_archived_idx
  on public.clients(is_archived) where is_archived = false;
