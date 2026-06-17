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

### Scaffold already built (2026-06-13) — dark, behind two flags
The full pipeline is in place and works end-to-end against a MOCK provider. Nothing is visible
to users until enabled. Pieces:
- **DB:** `supabase/migrations/0010_statement_publications.sql` — `statement_publications`
  tracking table + private `statements` storage bucket + RLS. **Not yet applied** (manual step).
- **Function:** `netlify/functions/publish-statement.js` — auth-checks caller, loads the row,
  calls `provider.publish()`, writes status. Contains the **provider seam**: `mockProvider`
  (active) + `cchProvider` stub + `getCchToken()` stub, switched by `CCH_ENABLED`.
- **Frontend:** `src/lib/statements.js` (upload to storage, upsert row, trigger publish, signed
  URLs) + `src/components/StatementsPanel.jsx` (per-month upload + status + Publish), rendered on
  `ClientDetailPage` only when `VITE_STATEMENTS_ENABLED === 'true'`.

**To dry-run the mock now:** apply migration 0010 in Supabase SQL Editor, set
`VITE_STATEMENTS_ENABLED=true` in Netlify, redeploy. Upload a PDF on a client → Publish → status
goes to "Published" (simulated). Carolyn is unaffected while the flag is off.

**To stitch up CCH when keys arrive (only these change):**
1. Implement `cchProvider.publish()` + `getCchToken()` in `publish-statement.js` (the only TODO).
2. Decide client→CCH-portal id mapping (likely a new `clients.cch_portal_id` column + migration).
3. Set `CCH_*` env vars in Netlify (see `.env.example`) and `CCH_ENABLED=true`.
No other files should need to change.
