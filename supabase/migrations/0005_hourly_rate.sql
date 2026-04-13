alter table public.clients
  add column if not exists hourly_rate numeric(10,2) not null default 80;
