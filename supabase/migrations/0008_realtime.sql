-- Enable Supabase Realtime broadcasting for the tables the app subscribes to,
-- so edits by one team member update other team members' screens live.
-- Idempotent: skips any table already in the publication.
do $$
declare t text;
begin
  foreach t in array array['account_months', 'client_months', 'accounts'] loop
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
