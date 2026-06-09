-- Force seeded staff (who were handed an auto-generated temporary password)
-- to set their own password on first login.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

update public.profiles
set must_change_password = true
where email in (
  'ldutcher@jbjcpas.com',
  'cwells@jbjcpas.com',
  'tfisk@jbjcpas.com',
  'kpetuch@jbjcpas.com',
  'kroberts@jbjcpas.com',
  'mtamilin@jbjcpas.com',
  'snewsome@jbjcpas.com',
  'akingston@jbjcpas.com',
  'hkrieger@jbjcpas.com'
);
