-- Comma-separated list of client contact email addresses, used to compose
-- "Financial Statements" emails from the client detail page.
alter table public.clients
  add column if not exists emails text;
