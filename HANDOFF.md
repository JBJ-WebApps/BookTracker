# BookTracker — session handoff

Pick-up notes for continuing on another machine. The memory notes in `~/.claude/`
do **not** sync across computers, so this file (which travels via OneDrive + GitHub)
is the source of truth for context.

## What this is
React + Vite + Tailwind + Supabase app, Netlify-hosted at **booktracker-jbj.netlify.app**,
for the accounting firm **Johns Benson & Johns**. Tracks monthly bookkeeping completion
per client/account. Admins see everything; employees see clients they're responsible/
assistant for. Months normalized to `period_month = YYYY-MM-01`.

## Repo state
Everything is committed and pushed to `main` — nothing pending. Get oriented with the
recent git log and these files:
`src/pages/DashboardPage.jsx`, `src/pages/ClientDetailPage.jsx`,
`src/components/Sidebar.jsx`, `src/components/MonthGrid.jsx`,
`src/pages/AuditLogPage.jsx`, `supabase/schema.sql`, `supabase/migrations/`.

## Shipped recently (this session)
- Dashboard **JAN–DEC F.S.-printed strip** on each client card (green = printed, red = not).
- **Client emails** field + one-click "Financial Statements" `mailto:` (subject defaults to
  the **prior** month; keeps the year).
- **Two-decimal currency** everywhere.
- **Live multi-user updates** via Supabase Realtime (client detail + dashboard re-fetch on change).
- **Sidebar redesign:** search → My Clients (own, expanded) → Other Employees (named groups) →
  All Clients A–Z. Names need migration `0009` (profiles read-all) — already applied live.
- **Editing locked** to assigned staff (responsible/assistant) + admins; everyone else view-only
  (UI-level enforcement via `canEdit`; DB write RLS intentionally left open).
- **Audit log rewritten** to group edit-bursts and show real detail (account + status + month).

## Key gotcha — DB migrations are manual
No Supabase CLI link / service-role key locally. Migration files in `supabase/migrations/`
are history only; they do **not** auto-apply. Apply SQL by hand in the Supabase dashboard
SQL Editor, and run it **before** pushing code that writes a new column (else all writes to
that table break). RLS is wide open (all authed) per migration `0004`.

## Open thread to continue — client portal
Carolyn/Kristina want clients to log in and view their own monthly financial statements.
Decision: favor **integrating with CCH Axcess** (firm already pays for it; SOC 2 / compliance-
grade; has a real API — the Open Integration Platform with Document/Portal APIs that can upload
+ publish to a client portal) **over** building a DIY portal (which would mean re-partitioning
the wide-open RLS and owning FTC Safeguards-Rule compliance).

Recommended **hybrid**: BookTracker stays the workflow UI; on "month done" it calls the CCH
Document/Portal API (from a Netlify serverless function, like the existing
`netlify/functions/manage-users.js`) to upload + publish the statement to the client's CCH portal.

**Next step:** Scott emailed the firm's CCH rep requesting minimum API/sandbox access. Unknowns
to confirm with CCH: exact endpoints, OAuth setup, API pricing/tier, and whether the client
"documents ready" email can be triggered via API (make-or-break for full automation).
When CCH replies, plan the integration from there.
