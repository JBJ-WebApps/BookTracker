-- Let any signed-in staff member read everyone's profile (name/email/role).
-- Needed so the sidebar can label clients with the responsible employee's
-- name instead of "UNKNOWN". Writes stay locked to self/admin.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles read all authed"
  on public.profiles for select
  using (auth.uid() is not null);
