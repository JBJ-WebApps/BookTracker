-- Open up client data so all employees can see and collaborate on every client.
-- Audit log becomes admin-only.

-- Clients: read open; writes still limited to responsible/assistant/admin (existing policies)
drop policy if exists "clients read own or admin"  on public.clients;
create policy "clients read all authed"
  on public.clients for select
  using (auth.uid() is not null);

-- Accounts
drop policy if exists "accounts read own or admin"  on public.accounts;
drop policy if exists "accounts write own or admin" on public.accounts;
create policy "accounts read all authed"
  on public.accounts for select
  using (auth.uid() is not null);
create policy "accounts write all authed"
  on public.accounts for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Account months
drop policy if exists "account_months read own or admin"  on public.account_months;
drop policy if exists "account_months write own or admin" on public.account_months;
create policy "account_months read all authed"
  on public.account_months for select
  using (auth.uid() is not null);
create policy "account_months write all authed"
  on public.account_months for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Client months
drop policy if exists "client_months read own or admin"  on public.client_months;
drop policy if exists "client_months write own or admin" on public.client_months;
create policy "client_months read all authed"
  on public.client_months for select
  using (auth.uid() is not null);
create policy "client_months write all authed"
  on public.client_months for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Client services
drop policy if exists "client_services read own or admin"  on public.client_services;
drop policy if exists "client_services write own or admin" on public.client_services;
create policy "client_services read all authed"
  on public.client_services for select
  using (auth.uid() is not null);
create policy "client_services write all authed"
  on public.client_services for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Audit log: admin only
drop policy if exists "audit read self or admin" on public.audit_log;
create policy "audit read admin only"
  on public.audit_log for select
  using (public.is_admin());
